import AVFoundation
import ExpoModulesCore
import GameController
import UIKit

// Écran du jeu rétro : fait tourner le core à 60 images par seconde, affiche l'image
// (Sharp = pixels nets, Smooth = lissée, CRT = lignes d'un vieux téléviseur), joue le son et lit la manette.
// Les côtés vides sont remplis par l'image du jeu floutée et assombrie (RetroPlay.dc.html).
// Jeux 2D : tout se passe sur le fil principal. Jeux 3D (N64, PSP) : le core tourne sur son propre fil
// et dessine avec le processeur graphique (RetroGPU) ; chaque appel au core passe alors par onCore.
// Nintendo DS : image 2D, mais sur le fil d'émulation aussi (calcul plus lourd). Ses deux écrans sont affichés
// séparément, aux places choisies par le JavaScript (prop dualScreen : côte à côte, empilés, focus).
// Nintendo 3DS : comme la DS (le core dessine avec Vulkan, mais son image arrive en 2D), écran du bas plus étroit.
// GameCube : pas un core libretro ; Dolphin fait tout lui-même (GameCubeSession), la vue lui prête sa couche Metal.
final class RetroView: ExpoView {
  let onError = EventDispatcher()
  let onMenu = EventDispatcher() // View + Menu ensemble : menu du jeu en cours
  let onStart = EventDispatcher() // le jeu tourne (compte du temps joué)
  let onSwapScreens = EventDispatcher() // clic du stick droit : échanger les écrans (DS, 3DS)
  let onWiiPointer = EventDispatcher() // Wii : pointeur recentré, ou collé à un bord (notices de WiiPlay.dc.html)

  // Le core ne fait tourner qu'un jeu à la fois : la vue active reçoit saveState / loadState.
  private(set) static weak var active: RetroView?

  private let backdrop = CALayer()
  private let blur = UIVisualEffectView(effect: UIBlurEffect(style: .dark))
  private let dim = UIView()
  private let screen = CALayer()
  private let scanlines = CAReplicatorLayer()
  private let scanline = CALayer()
  private let audio = RetroAudio()
  private var displayLink: CADisplayLink?
  private var lastImage: CGImage?
  private var frameLines: CGFloat = 224

  // Réglages reçus du JavaScript.
  private var romPath: String?
  private var sramPath: String?
  private var startStatePath: String?
  private var autoSaveStatePath: String?
  private var autoSaveImagePath: String?
  private var paused = false
  private var fastForward = false
  private var screenMode = "Sharp"
  private var fillScreen = false
  private var touchControls = false
  private var touchOverImage = false
  private var dualScreen: DualScreenLayout?

  // Deux écrans de la DS : moitié haute et moitié basse de l'image du jeu.
  private let topScreen = DualScreenPart()
  private let bottomScreen = DualScreenPart()
  private var stickClickHeld = false
  // 3DS : stick gauche analogique (Circle Pad), ZL / ZR ; écran du bas centré sous celui du haut (80 % de sa largeur).
  private var threeDS = false
  private var bottomScreenWidth: CGFloat = 1

  private var running = false
  private var restartScheduled = false
  private var aspect: CGFloat = 4.0 / 3.0
  private var frameTime = 1.0 / 60.0988
  private var lastTimestamp: CFTimeInterval = 0
  private var accumulator: CFTimeInterval = 0
  private var comboHeld = false
  private var observers: [NSObjectProtocol] = []

  // Jeux 3D seulement.
  private var gpu: RetroGPU?
  private var worker: EmulationThread?
  private let frameInFlight = Locked(false) // le fil d'émulation n'a pas fini l'image précédente
  private var inBackground = false // iOS interdit le processeur graphique en arrière-plan

  // GameCube seulement.
  private var gameCubeGame = false // prop du JavaScript
  private var gameCube: GameCubeSession?
  private let gameCubeHost = CALayer() // porte la couche Metal de Dolphin, à la place de l'image du jeu
  private var gameCubeStarted = false
  private var wiiRecenters = 0
  private var wiiEdge: String?
  private var gameCubeOptions: [String: Double] = [:] // réglages de Dolphin (RetroPlayScreen, GAMECUBE_OPTIONS)
  private var clockTime: CFTimeInterval = 0

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
    clipsToBounds = true

    backdrop.contentsGravity = .resizeAspectFill
    backdrop.actions = ["contents": NSNull()]
    layer.addSublayer(backdrop)
    addSubview(blur)
    dim.backgroundColor = UIColor(red: 8 / 255, green: 8 / 255, blue: 10 / 255, alpha: 0.45)
    addSubview(dim)

    screen.contentsGravity = .resize
    screen.actions = ["contents": NSNull(), "bounds": NSNull(), "position": NSNull()]
    layer.addSublayer(screen)
    scanline.backgroundColor = UIColor(white: 0, alpha: 0.32).cgColor
    scanlines.addSublayer(scanline)
    scanlines.actions = ["bounds": NSNull(), "position": NSNull()]
    screen.addSublayer(scanlines)
    layer.addSublayer(topScreen.holder)
    layer.addSublayer(bottomScreen.holder)
    topScreen.holder.isHidden = true
    bottomScreen.holder.isHidden = true
    gameCubeHost.actions = ["bounds": NSNull(), "position": NSNull()]
    gameCubeHost.isHidden = true
    layer.addSublayer(gameCubeHost)
    applyScreenMode()

    // Arrière-plan : sauvegarde du jeu et sauvegarde auto ; au retour, le son reprend.
    // GameCube : Dolphin se met en pause (pas de dessin en arrière-plan) et reprend au retour.
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
      guard let self = self, self.running else { return }
      self.inBackground = true
      if let gameCube = self.gameCube {
        gameCube.setPaused(true, capture: false)
        if self.gameCubeStarted, let state = self.autoSaveStatePath { gameCube.save(state, image: self.autoSaveImagePath) { _ in } }
        return
      }
      self.onCore { _ = rf_save_sram() }
      self.writeAutoSave()
      if self.worker != nil { self.onCore { rf_gpu_finish() } }
    })
    observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
      guard let self = self else { return }
      self.inBackground = false
      guard self.running else { return }
      if let gameCube = self.gameCube {
        gameCube.setPaused(self.paused, capture: false)
        return
      }
      self.lastTimestamp = 0
      self.audio.resume()
    })
  }

  deinit {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
  }

  // MARK: - Props

  func setRomPath(_ path: String?) {
    guard path != romPath else { return }
    romPath = path
    scheduleRestart()
  }

  func setSramPath(_ path: String?) { sramPath = path }
  func setStartStatePath(_ path: String?) { startStatePath = path }
  func setAutoSave(state: String?, image: String?) {
    autoSaveStatePath = state
    autoSaveImagePath = image
  }

  func setPaused(_ value: Bool) {
    paused = value
    lastTimestamp = 0
    // Menu du jeu ouvert : image prise juste avant la pause (vignette des sauvegardes d'état).
    if gameCubeStarted { gameCube?.setPaused(value || inBackground, capture: value && !inBackground) }
  }

  func setGameCube(_ value: Bool) {
    gameCubeGame = value
  }

  func setGameCubeOptions(_ value: [String: Double]?) {
    gameCubeOptions = value ?? [:]
  }

  // Résolution interne (maquette du 06/10/2026) : 3DS, lue au lancement (citra_resolution_factor) ; GameCube et Wii,
  // envoyée aussi pendant la partie (efb_scale). Dès 2, l'image est lissée même en Sharp (plus de gros pixels).
  private var resolution = 1

  func setResolution(_ value: Int) {
    let scale = min(3, max(1, value))
    guard scale != resolution else { return }
    resolution = scale
    applyScreenMode()
    if let session = gameCube {
      session.setResolution(scale)
      setNeedsLayout()
    }
  }

  func setFastForward(_ value: Bool) {
    fastForward = value
    if let worker = worker {
      worker.async { rf_set_audio_enabled(!value) }
    } else {
      rf_set_audio_enabled(!value)
    }
  }

  func setScreenMode(_ mode: String) {
    screenMode = mode
    applyScreenMode()
  }

  func setFillScreen(_ value: Bool) {
    fillScreen = value
    setNeedsLayout()
  }

  func setTouchControls(_ value: Bool) {
    touchControls = value
    setNeedsLayout()
  }

  func setTouchOverImage(_ value: Bool) {
    touchOverImage = value
    setNeedsLayout()
  }

  // DS : [x, y, largeur, hauteur] de l'écran du haut puis de l'écran du bas (en points, dans la vue),
  // puis l'arrondi des coins. nil ou incomplet : une seule image, comme les autres systèmes.
  func setDualScreen(_ values: [Double]?) {
    dualScreen = DualScreenLayout(values)
    setNeedsLayout()
  }

  // Les réglages arrivent un par un : on redémarre une fois qu'ils sont tous posés.
  private func scheduleRestart() {
    guard !restartScheduled else { return }
    restartScheduled = true
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.restartScheduled = false
      self.stop()
      if self.window != nil { self.start() }
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { stop() } else if !running { scheduleRestart() }
  }

  // MARK: - Mise en page

  override func layoutSubviews() {
    super.layoutSubviews()
    layoutScreen()
  }

  // Original : la plus grande image au format du jeu (4:3 pour la SNES), centrée.
  // Fill screen : toute la vue.
  // Contrôles tactiles (TouchRetro.dc.html) : l'image rétrécit, à 16 pt du haut (480 × 360 sur 852 × 393),
  // pour laisser les bandes latérales aux boutons ; Fill screen ne s'applique pas. GameCube et Wii : voir plus bas.
  // touchOverImage (PSP, TouchPSP.dc.html) : l'image garde toute la hauteur, les boutons sont posés dessus,
  // et les côtés restent noirs.
  private func layoutScreen() {
    guard bounds.width > 0, bounds.height > 0 else { return }
    if let gameCube = gameCube {
      // GameCube et Wii : toute la vue ; Dolphin centre lui-même l'image au bon format, bandes noires sur les côtés.
      // Contrôles tactiles : la bande sous la pastille, large comme une image 4:3 (480 × 360 sur 852 × 393), pour
      // laisser les côtés aux boutons ; une image Wii 16:9 y fait 480 × 270 (maquette des contrôles tactiles Wii).
      // Fill screen (Settings › Retro › Picture size), avec la manette : « widescreen hack » de Dolphin, la scène 3D
      // est élargie à la forme de l'écran (le simple étirement du 06/10 déformait les personnages).
      var area = bounds
      if touchControls {
        let height = max(bounds.height - 33, 1)
        let width = min(bounds.width, (height * 4 / 3).rounded())
        area = CGRect(x: ((bounds.width - width) / 2).rounded(), y: 16, width: width, height: height)
      }
      gameCube.setFillScreen(fillScreen && !touchControls)
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      gameCubeHost.frame = area
      gameCube.layout(size: area.size)
      CATransaction.commit()
      screen.isHidden = true
      backdrop.isHidden = true
      blur.isHidden = true
      dim.isHidden = true
      return
    }
    let dual = dualScreen
    screen.isHidden = dual != nil
    topScreen.holder.isHidden = dual == nil
    bottomScreen.holder.isHidden = dual == nil
    // DS (DSSideBySide / DSStacked / DSFocus.dc.html) : fond uni #050507, sans image floutée sur les côtés.
    backgroundColor = dual != nil ? UIColor(red: 5 / 255, green: 5 / 255, blue: 7 / 255, alpha: 1) : .black
    if let dual = dual {
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      topScreen.layout(frame: dual.top, radius: dual.radius)
      bottomScreen.layout(frame: dual.bottom, radius: dual.radius)
      CATransaction.commit()
      backdrop.isHidden = true
      blur.isHidden = true
      dim.isHidden = true
      return
    }
    let shrink = touchControls && !touchOverImage
    let area = shrink ? CGRect(x: 0, y: 16, width: bounds.width, height: max(bounds.height - 33, 1)) : bounds
    var frame = area
    if !fillScreen || touchControls {
      var height = area.height
      var width = (height * aspect).rounded()
      if width > area.width {
        width = area.width
        height = (width / aspect).rounded()
      }
      frame = CGRect(
        x: area.minX + ((area.width - width) / 2).rounded(), y: area.minY + ((area.height - height) / 2).rounded(),
        width: width, height: height)
    }
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    backdrop.frame = bounds.insetBy(dx: -40, dy: -40)
    blur.frame = bounds
    dim.frame = bounds
    screen.frame = frame
    // Ombre de la maquette tactile : 0 0 40px rgba(0,0,0,0.6).
    screen.shadowOpacity = shrink ? 0.6 : 0
    screen.shadowRadius = 20
    screen.shadowOffset = .zero
    screen.shadowPath = UIBezierPath(rect: screen.bounds).cgPath
    layoutScanlines()
    if let gpu = gpu {
      gpu.layer.frame = screen.bounds
      let scale = gpu.layer.contentsScale
      gpu.pixelSize.current = CGSize(width: (frame.width * scale).rounded(), height: (frame.height * scale).rounded())
    }
    CATransaction.commit()
    let sides = (frame.width < bounds.width - 1 || frame.height < bounds.height - 1) && !(touchControls && touchOverImage)
    backdrop.isHidden = !sides
    blur.isHidden = !sides
    dim.isHidden = !sides
  }

  // CRT : une ligne sombre sous chaque ligne de l'image du jeu.
  private func layoutScanlines() {
    let lineHeight = screen.bounds.height / max(frameLines, 1)
    scanlines.frame = screen.bounds
    scanlines.instanceCount = Int(frameLines)
    scanlines.instanceTransform = CATransform3DMakeTranslation(0, lineHeight, 0)
    scanline.frame = CGRect(x: 0, y: lineHeight / 2, width: screen.bounds.width, height: lineHeight / 2)
  }

  private func applyScreenMode() {
    let filter: CALayerContentsFilter = screenMode == "Sharp" && resolution < 2 ? .nearest : .linear
    screen.magnificationFilter = filter
    screen.minificationFilter = filter
    scanlines.isHidden = screenMode != "CRT"
    gpu?.smooth.current = filter == .linear
    topScreen.apply(filter: filter, crt: screenMode == "CRT")
    bottomScreen.apply(filter: filter, crt: screenMode == "CRT")
  }

  // MARK: - Démarrage et arrêt

  private func start() {
    guard let path = romPath, !running else { return }
    if let other = RetroView.active, other !== self { other.stop() }
    if gameCubeGame { return startGameCube(path) }

    let savePath: String
    do {
      savePath = try sramPath ?? RetroFiles.savePath(forRom: path)
    } catch {
      onError(["message": "The save folder could not be created."])
      return
    }
    threeDS = rf_is_3ds_game(path)
    if threeDS { rf_set_core_option("citra_resolution_factor", String(resolution)) }
    // Azahar : 400 × 480, écran du bas de 320 de large centré ; melonDS DS : deux écrans de 256 de large.
    bottomScreenWidth = threeDS ? 0.8 : 1
    topScreen.lines = threeDS ? 240 : 192
    bottomScreen.lines = threeDS ? 240 : 192
    let systemPath: String?
    do {
      systemPath = try rf_is_psp_game(path) ? RetroFiles.systemDirectory() : nil
    } catch {
      onError(["message": "The PSP system files could not be prepared."])
      return
    }

    // Jeu 3D : son affichage, avant de charger le jeu (le core prépare ses images OpenGL au chargement).
    if rf_is_gpu_game(path) {
      guard let display = RetroGPU() else {
        onError(["message": "This iPhone couldn't prepare the 3D image."])
        return
      }
      gpu = display
      display.smooth.current = screenMode != "Sharp"
      screen.insertSublayer(display.layer, at: 0) // sous les lignes du mode CRT
    }
    // Jeux 3D et DS : leur propre fil.
    if rf_is_threaded_game(path) {
      let thread = EmulationThread()
      thread.start()
      worker = thread
    }
    let gpu = self.gpu
    let loaded = onCore { () -> Bool in
      gpu?.makeGameContextCurrent()
      return rf_load_game(path, savePath, systemPath)
    }
    guard loaded else {
      let message = String(cString: rf_error())
      releaseGPU()
      onError(["message": message])
      return
    }
    if let state = startStatePath, FileManager.default.fileExists(atPath: state) {
      onCore { _ = rf_load_state(state) } // « Continue » : reprend à la sauvegarde auto (ou à l'emplacement choisi)
    }
    running = true
    RetroView.active = self
    let audioOn = !fastForward
    let (ratio, fps, sampleRate) = onCore { () -> (Double, Double, Double) in
      rf_set_audio_enabled(audioOn)
      return (rf_aspect_ratio(), rf_fps(), rf_sample_rate())
    }
    aspect = CGFloat(ratio)
    frameTime = 1.0 / fps
    // CRT : le N64 affiche le plus souvent 240 lignes, la PSP 272 (l'image 3D est plus fine, rendue en 2x).
    if gpu != nil { frameLines = rf_is_psp_game(path) ? 272 : 240 }
    lastTimestamp = 0
    accumulator = 0
    setNeedsLayout()
    audio.start(sampleRate: sampleRate)

    let link = CADisplayLink(target: DisplayLinkTarget(self), selector: #selector(DisplayLinkTarget.tick(_:)))
    link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 60, preferred: 60)
    link.add(to: .main, forMode: .common)
    displayLink = link
    onStart()
  }

  // GameCube : Dolphin démarre sur ses fils ; tick suit son état (onStart quand le jeu tourne, sauvegarde à reprendre).
  private func startGameCube(_ path: String) {
    guard let session = GameCubeSession() else {
      onError(["message": "The GameCube core couldn't be prepared on this iPhone."])
      return
    }
    gameCube = session
    session.setResolution(resolution)
    gameCubeStarted = false
    running = true
    RetroView.active = self
    gameCubeHost.addSublayer(session.layer)
    gameCubeHost.isHidden = false
    backgroundColor = .black
    setNeedsLayout()
    layoutIfNeeded()
    session.start(path: path, options: gameCubeOptions) { [weak self] launched in
      guard let self = self, self.gameCube === session else { return }
      guard launched else { return self.failGameCube(session.lastError) }
      let link = CADisplayLink(target: DisplayLinkTarget(self), selector: #selector(DisplayLinkTarget.tick(_:)))
      link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 60, preferred: 60)
      link.add(to: .main, forMode: .common)
      self.displayLink = link
    }
  }

  private func failGameCube(_ message: String) {
    autoSaveStatePath = nil // rien à sauvegarder : le jeu n'a pas tourné ou s'est arrêté seul
    stop()
    onError(["message": message.isEmpty ? "The game could not be started." : message])
  }

  // Suit Dolphin à chaque image de l'écran : démarrage, arrêt imprévu, manette et écran tactile, horloge automatique.
  private func tickGameCube(_ session: GameCubeSession, _ link: CADisplayLink) {
    if !gameCubeStarted {
      if session.isRunning {
        gameCubeStarted = true
        session.applyClock()
        onStart()
        if let state = startStatePath, FileManager.default.fileExists(atPath: state) {
          session.load(state) { _ in } // « Continue » : reprend à la sauvegarde auto (ou à l'emplacement choisi)
        }
        session.setPaused(paused || inBackground, capture: false)
      } else if session.isStopped {
        failGameCube(session.lastError)
      }
      return
    }
    if session.isStopped { return failGameCube(session.lastError) }

    let pad = currentPad()
    let view = pad?.buttonOptions?.isPressed ?? false
    let menu = pad?.buttonMenu.isPressed ?? false
    if view && menu {
      if !comboHeld { onMenu() }
      comboHeld = true
    } else if !view && !menu {
      comboHeld = false
    }
    session.send(pad, active: !paused, menuHeld: comboHeld)
    if session.recenters != wiiRecenters {
      wiiRecenters = session.recenters
      onWiiPointer(["recentered": true])
    }
    if session.pointerEdge != wiiEdge {
      wiiEdge = session.pointerEdge
      onWiiPointer(["edge": wiiEdge ?? ""])
    }

    if link.timestamp - clockTime >= 1 {
      clockTime = link.timestamp
      session.adjustClock(speed: session.speed.0)
    }
  }

  private func stop() {
    displayLink?.invalidate()
    displayLink = nil
    if let session = gameCube {
      session.stop(autoSave: gameCubeStarted ? autoSaveStatePath : nil, image: autoSaveImagePath)
      session.layer.removeFromSuperlayer()
      gameCubeHost.isHidden = true
      gameCube = nil
      gameCubeStarted = false
      running = false
      if RetroView.active === self { RetroView.active = nil }
      return
    }
    audio.stop()
    if running {
      writeAutoSave()
      onCore { rf_unload_game() } // enregistre aussi la sauvegarde du jeu
    }
    running = false
    releaseGPU()
    if RetroView.active === self { RetroView.active = nil }
    screen.contents = nil
    backdrop.contents = nil
    topScreen.show(nil)
    bottomScreen.show(nil)
    lastImage = nil
  }

  // Jeu 3D ou DS : libère l'affichage 3D (le jeu est déjà déchargé) et arrête le fil d'émulation.
  private func releaseGPU() {
    guard let worker = worker else { return }
    let gpu = self.gpu
    worker.sync { gpu?.teardown() }
    worker.finish()
    gpu?.layer.removeFromSuperlayer()
    self.gpu = nil
    self.worker = nil
    frameInFlight.current = false
  }

  // Appel au core : sur le fil d'émulation pour un jeu 3D (en attendant la fin), sinon ici même.
  @discardableResult
  private func onCore<T>(_ job: @escaping () -> T) -> T {
    if let worker = worker { return worker.sync(job) }
    return job()
  }

  // « Auto-save when I quit » : l'instant du jeu et son image (vignette « Auto-save »).
  private func writeAutoSave() {
    guard let state = autoSaveStatePath else { return }
    _ = saveState(statePath: state, imagePath: autoSaveImagePath)
  }

  // MARK: - Sauvegardes d'état (appelées par le module)

  // GameCube : Dolphin écrit la sauvegarde sur ses fils (réponse plus tard). Pas encore de vignette :
  // l'ancienne image de l'emplacement est effacée pour ne pas montrer un autre instant.
  func saveState(statePath: String, imagePath: String?, completion: @escaping (Bool) -> Void) {
    guard let session = gameCube else { return completion(saveState(statePath: statePath, imagePath: imagePath)) }
    guard gameCubeStarted else { return completion(false) }
    session.save(statePath, image: imagePath, completion: completion)
  }

  func loadState(statePath: String, completion: @escaping (Bool) -> Void) {
    guard let session = gameCube else { return completion(loadState(statePath: statePath)) }
    guard gameCubeStarted else { return completion(false) }
    session.load(statePath, completion: completion)
  }

  func saveState(statePath: String, imagePath: String?) -> Bool {
    guard running else { return false }
    let gpu = self.gpu
    let (saved, snapshot) = onCore { () -> (Bool, CGImage?) in
      guard rf_save_state(statePath) else { return (false, nil) }
      return (true, gpu?.snapshot()) // jeu 3D : image lue sur le processeur graphique
    }
    guard saved else { return false }
    if let imagePath = imagePath, let image = snapshot ?? lastImage, let png = UIImage(cgImage: image).pngData() {
      try? png.write(to: URL(fileURLWithPath: imagePath), options: .atomic)
    }
    return true
  }

  func loadState(statePath: String) -> Bool {
    guard running else { return false }
    let gpu = self.gpu
    let audioOn = !fastForward
    let (loaded, image) = onCore { () -> (Bool, CGImage?) in
      guard rf_load_state(statePath) else { return (false, nil) }
      // Le jeu est souvent en pause (menu ouvert) : on affiche tout de suite l'instant chargé.
      rf_set_audio_enabled(false)
      rf_run_frame(0)
      rf_set_audio_enabled(audioOn)
      gpu?.present()
      return (true, gpu == nil ? RetroImage.latest() : nil)
    }
    guard loaded else { return false }
    if let image = image { display(image) }
    return true
  }

  // MARK: - Boucle de jeu

  fileprivate func tick(_ link: CADisplayLink) {
    if let session = gameCube {
      if running, !inBackground, !paused || !gameCubeStarted { tickGameCube(session, link) }
      return
    }
    guard running, !paused, !inBackground else { return }

    // Une image du jeu par image de l'écran (60 Hz) ; sur un écran 120 Hz, une sur deux.
    // Jeux 2D : après un à-coup, on ne rattrape pas d'un coup, le jeu ralentit un instant.
    // Jeux sur le fil d'émulation (3D, DS) : on garde jusqu'à 3 images de retard, rattrapées ci-dessous.
    let backlog: Double = worker != nil ? 3 : 2
    if lastTimestamp == 0 { lastTimestamp = link.timestamp - frameTime }
    accumulator = min(accumulator + link.timestamp - lastTimestamp, frameTime * backlog)
    lastTimestamp = link.timestamp
    guard accumulator >= frameTime * 0.9 else { return }

    // Avance rapide : 4 images du jeu par image de l'écran, seule la dernière est affichée.
    let speed = fastForward ? 4 : 1
    if let worker = worker {
      // Si le fil d'émulation n'a pas fini, on attend le prochain tour. Les images lourdes
      // (plus de 16,7 ms, dans les menus de Spider-Man par exemple) font ainsi sauter des tours :
      // on lance alors d'un coup toutes les images dues (3 au plus), et seule la dernière est affichée.
      // Sans ce rattrapage, le jeu tombait à 40 images/s alors que la moyenne tenait dans le temps.
      guard !frameInFlight.current else { return }
      let owed = max(1, min(Int(backlog), Int(accumulator / frameTime + 0.1)))
      accumulator = max(accumulator - Double(owed) * frameTime, 0)
      let count = owed * speed
      frameInFlight.current = true
      let gpu = self.gpu
      let buttons = readPad(analog: gpu != nil || threeDS) // DS : le stick gauche sert de croix, comme en 2D
      let sticks = readSticks()
      let softwareSticks = threeDS ? sticks : nil // DS : pas de stick
      let wantsBackdrop = !backdrop.isHidden
      let inFlight = frameInFlight
      worker.async { [weak self] in
        let frame = gpu?.run(count, buttons: buttons, sticks: sticks, backdrop: wantsBackdrop)
          ?? RetroSoftware.run(count, buttons: buttons, sticks: softwareSticks)
        inFlight.current = false
        guard frame.image != nil || frame.backdrop != nil || frame.failed else { return }
        DispatchQueue.main.async { self?.show(frame) }
      }
      return
    }

    accumulator = max(accumulator - frameTime, 0)
    let buttons = readPad(analog: false)
    for _ in 0..<speed {
      rf_run_frame(buttons)
    }
    showFrame()
  }

  // Jeu 3D ou DS : ce que le fil d'émulation a préparé pour la vue.
  private func show(_ frame: RetroGPU.Frame) {
    guard running else { return }
    if frame.failed { // le jeu n'a pas démarré (PSP) : message de l'écran d'erreur, sans sauvegarde auto
      let message = String(cString: rf_error())
      autoSaveStatePath = nil
      stop()
      onError(["message": message])
      return
    }
    if let image = frame.image { // image 2D (moteur Angrylion)
      display(image)
    }
    if let image = frame.backdrop {
      lastImage = image
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      if !backdrop.isHidden { backdrop.contents = image }
      CATransaction.commit()
    }
  }

  private func showFrame() {
    var width: UInt32 = 0
    var height: UInt32 = 0
    guard let pixels = rf_frame(&width, &height), width > 0, height > 0,
          let image = RetroImage.make(pixels, width: width, height: height)
    else { return }
    display(image)
  }

  private func display(_ image: CGImage) {
    let height = CGFloat(image.height)
    lastImage = image
    if dualScreen != nil {
      // DS : moitié haute = écran du haut, moitié basse = écran du bas (melonDS DS, disposition « top-bottom »).
      // 3DS : l'écran du bas est plus étroit, centré dans la moitié basse (Azahar : 320 sur 400, à partir de 40).
      let half = image.height / 2
      let bottomWidth = Int((CGFloat(image.width) * bottomScreenWidth).rounded())
      let bottomX = (image.width - bottomWidth) / 2
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      topScreen.show(image.cropping(to: CGRect(x: 0, y: 0, width: image.width, height: half)))
      bottomScreen.show(image.cropping(to: CGRect(x: bottomX, y: half, width: bottomWidth, height: half)))
      CATransaction.commit()
      return
    }
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    screen.contents = image
    if !backdrop.isHidden { backdrop.contents = image }
    if height != frameLines {
      frameLines = height
      layoutScanlines()
    }
    CATransaction.commit()
  }

  // Boutons de la manette → manette SNES, à la même place : le bouton du bas (A Xbox) = B SNES,
  // celui de droite (B) = A, de gauche (X) = Y, du haut (Y) = X. View = Select, Menu = Start.
  // Game Boy / GBA : même règle (A Xbox = B, B Xbox = A) ; X et Y y sont des tirs automatiques de mGBA.
  // analog (N64) : le stick gauche reste analogique (readSticks) au lieu de servir de croix, et LT = L2.
  // Mupen64Plus-Next lit A N64 sur B libretro (A Xbox), B N64 sur Y (X Xbox), Z sur L2 (LT),
  // L et R sur LB et RB, Start sur Start (Menu), les boutons C sur le stick droit.
  // PPSSPP (PSP, analog aussi) : croix sur B libretro (A Xbox), rond sur A (B Xbox), carré sur Y (X Xbox),
  // triangle sur X (Y Xbox) : chaque bouton garde sa place. L et R sur LB et RB, le stick gauche analogique.
  // Azahar (3DS, analog aussi) : A, B, X, Y de la 3DS sur A, B, X, Y libretro (même place que SNES et DS),
  // L et R sur LB et RB, ZL et ZR sur LT et RT (L2 et R2), Circle Pad sur le stick gauche, stick C sur le droit.
  private func readPad(analog: Bool) -> UInt16 {
    guard let pad = currentPad() else { return 0 }
    var bits: UInt16 = 0
    func press(_ bit: UInt16, _ on: Bool) {
      if on { bits |= 1 << bit }
    }
    let stick = pad.leftThumbstick
    let stickAsDpad = !analog
    press(RetroButton.b, pad.buttonA.isPressed)
    press(RetroButton.a, pad.buttonB.isPressed)
    press(RetroButton.y, pad.buttonX.isPressed)
    press(RetroButton.x, pad.buttonY.isPressed)
    press(RetroButton.l, pad.leftShoulder.isPressed)
    press(RetroButton.r, pad.rightShoulder.isPressed)
    if analog { press(RetroButton.l2, pad.leftTrigger.isPressed) }
    if threeDS { press(RetroButton.r2, pad.rightTrigger.isPressed) }
    press(RetroButton.up, pad.dpad.up.isPressed || (stickAsDpad && stick.yAxis.value > 0.5))
    press(RetroButton.down, pad.dpad.down.isPressed || (stickAsDpad && stick.yAxis.value < -0.5))
    press(RetroButton.left, pad.dpad.left.isPressed || (stickAsDpad && stick.xAxis.value < -0.5))
    press(RetroButton.right, pad.dpad.right.isPressed || (stickAsDpad && stick.xAxis.value > 0.5))

    // Clic du stick droit : échanger les écrans de la DS et de la 3DS (le JavaScript décide ; les autres l'ignorent).
    let stickClick = pad.rightThumbstickButton?.isPressed ?? false
    if stickClick && !stickClickHeld { onSwapScreens() }
    stickClickHeld = stickClick

    let view = pad.buttonOptions?.isPressed ?? false
    let menu = pad.buttonMenu.isPressed
    if view && menu {
      if !comboHeld { onMenu() }
      comboHeld = true
    } else if !view && !menu {
      comboHeld = false
    }
    if !comboHeld {
      press(RetroButton.select, view)
      press(RetroButton.start, menu)
    }
    return bits
  }

  // Sticks gauche puis droit, X puis Y, de -32767 à 32767 ; libretro compte Y vers le bas, la manette vers le haut.
  private func readSticks() -> [Int16] {
    guard let pad = currentPad() else { return [0, 0, 0, 0] }
    func axis(_ value: Float) -> Int16 {
      Int16(max(-1, min(1, value)) * 32767)
    }
    return [
      axis(pad.leftThumbstick.xAxis.value), axis(-pad.leftThumbstick.yAxis.value),
      axis(pad.rightThumbstick.xAxis.value), axis(-pad.rightThumbstick.yAxis.value),
    ]
  }

  private func currentPad() -> GCExtendedGamepad? {
    (GCController.current ?? GCController.controllers().first)?.extendedGamepad
  }
}

// Places des deux écrans de la DS, reçues du JavaScript (prop dualScreen).
struct DualScreenLayout {
  let top: CGRect
  let bottom: CGRect
  let radius: CGFloat

  init?(_ values: [Double]?) {
    guard let v = values, v.count >= 9 else { return nil }
    top = CGRect(x: v[0], y: v[1], width: v[2], height: v[3])
    bottom = CGRect(x: v[4], y: v[5], width: v[6], height: v[7])
    radius = CGFloat(v[8])
  }
}

// Un écran de la DS ou de la 3DS : son image (coins arrondis), l'ombre des maquettes (0 10px 30px rgba(0,0,0,0.6))
// et les lignes du mode CRT (192 lignes par écran sur la DS, 240 sur la 3DS).
final class DualScreenPart {
  let holder = CALayer() // porte l'ombre : l'image, elle, coupe ce qui dépasse de ses coins arrondis
  private let image = CALayer()
  private let scanlines = CAReplicatorLayer()
  private let scanline = CALayer()
  var lines: CGFloat = 192 // à poser avant layout

  init() {
    let still: [String: CAAction] = ["contents": NSNull(), "bounds": NSNull(), "position": NSNull(), "cornerRadius": NSNull()]
    holder.actions = still
    holder.shadowColor = UIColor.black.cgColor
    holder.shadowOpacity = 0.6
    holder.shadowRadius = 15
    holder.shadowOffset = CGSize(width: 0, height: 10)
    image.actions = still
    image.contentsGravity = .resize
    image.masksToBounds = true
    image.backgroundColor = UIColor.black.cgColor
    scanlines.actions = still
    scanline.backgroundColor = UIColor(white: 0, alpha: 0.32).cgColor
    scanlines.addSublayer(scanline)
    image.addSublayer(scanlines)
    holder.addSublayer(image)
  }

  func layout(frame: CGRect, radius: CGFloat) {
    holder.frame = frame
    holder.shadowPath = UIBezierPath(roundedRect: holder.bounds, cornerRadius: radius).cgPath
    image.frame = holder.bounds
    image.cornerRadius = radius
    let lineHeight = frame.height / lines
    scanlines.frame = image.bounds
    scanlines.instanceCount = Int(lines)
    scanlines.instanceTransform = CATransform3DMakeTranslation(0, lineHeight, 0)
    scanline.frame = CGRect(x: 0, y: lineHeight / 2, width: frame.width, height: lineHeight / 2)
  }

  func apply(filter: CALayerContentsFilter, crt: Bool) {
    image.magnificationFilter = filter
    image.minificationFilter = filter
    scanlines.isHidden = !crt
  }

  func show(_ picture: CGImage?) {
    image.contents = picture
  }
}

// Numéros des boutons de la manette libretro (RETRO_DEVICE_ID_JOYPAD_*).
enum RetroButton {
  static let b: UInt16 = 0
  static let y: UInt16 = 1
  static let select: UInt16 = 2
  static let start: UInt16 = 3
  static let up: UInt16 = 4
  static let down: UInt16 = 5
  static let left: UInt16 = 6
  static let right: UInt16 = 7
  static let a: UInt16 = 8
  static let x: UInt16 = 9
  static let l: UInt16 = 10
  static let r: UInt16 = 11
  static let l2: UInt16 = 12
  static let r2: UInt16 = 13
}

// CADisplayLink garde sa cible : ce relais évite que la vue ne soit jamais libérée.
private final class DisplayLinkTarget: NSObject {
  private weak var view: RetroView?

  init(_ view: RetroView) {
    self.view = view
    super.init()
  }

  @objc func tick(_ link: CADisplayLink) {
    guard let view = view else { return link.invalidate() }
    view.tick(link)
  }
}

// Son du jeu : iOS vient chercher les échantillons au rythme du haut-parleur
// (le mixeur convertit les 32 kHz de la SNES vers la fréquence de l'iPhone).
final class RetroAudio {
  private let engine = AVAudioEngine()
  private var source: AVAudioSourceNode?

  func start(sampleRate: Double) {
    stop()
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playback, mode: .default)
    try? session.setActive(true)

    guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 2) else { return }
    let node = AVAudioSourceNode(format: format) { _, _, frameCount, bufferList -> OSStatus in
      let buffers = UnsafeMutableAudioBufferListPointer(bufferList)
      guard buffers.count >= 2,
            let left = buffers[0].mData?.assumingMemoryBound(to: Float.self),
            let right = buffers[1].mData?.assumingMemoryBound(to: Float.self)
      else { return noErr }
      rf_audio_read(left, right, frameCount)
      return noErr
    }
    engine.attach(node)
    engine.connect(node, to: engine.mainMixerNode, format: format)
    source = node
    engine.prepare()
    do {
      try engine.start()
    } catch {
      NSLog("[Retro] audio: %@", error.localizedDescription)
    }
  }

  func resume() {
    guard source != nil, !engine.isRunning else { return }
    try? engine.start()
  }

  func stop() {
    engine.stop()
    if let node = source {
      engine.detach(node)
    }
    source = nil
  }
}
