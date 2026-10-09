import AVFoundation
import CoreMotion
import GameCube
import GameController
import QuartzCore
import UIKit

// GameCube : le cœur Dolphin d'iCube (prebuilt/GameCube.framework, compilé avec notre pont gc_* par le dépôt
// GitHub Hope221/overrrrhere-gamecube). Contrairement aux cores libretro, Dolphin dessine lui-même dans sa couche
// Metal, joue lui-même le son et fait tourner le jeu sur ses propres fils : la vue lui transmet la manette,
// suit son état (démarrage, arrêt) et le met en pause. Sans JIT (Cached Interpreter), sans BIOS.
// Ce qui attend Dolphin (démarrage après une autre partie, sauvegardes, arrêt) passe par une file à part :
// Dolphin a lui-même besoin du fil principal pendant ces opérations.
final class GameCubeSession {
  private static var ready = false
  private static let queue = DispatchQueue(label: "overrrrhere.gamecube")
  // La couche Metal du pont sert à toutes les parties : gardée ici pour toute la vie de l'app. Sans ça, iOS la
  // libérait en quittant un jeu (retirée de l'écran) et la partie suivante réutilisait une couche disparue :
  // plantage à la relance d'un jeu GameCube (rapports du 27/09/2026, builds 24 et 25).
  private static var sharedLayer: CALayer?

  let layer: CALayer

  // Réglages reçus du JavaScript (retenus après les essais de vitesse du 27/09/2026) : ceux de Dolphin (gc_set_option),
  // plus l'horloge automatique (auto_clock), une vitesse fixe du processeur simulé (cpu_clock) et
  // l'inversion des axes du stick C (invert_c_x, invert_c_y).
  private var autoClock = false
  private var invertCX = false
  private var invertCY = false
  private(set) var clock = 1.0
  private var steadySeconds = 0
  // Jeu Wii (même cœur Dolphin) : profil de commandes (wii_profile, maquette WiiControls.dc.html). Jeu GameCube : .none.
  private var wiiProfile = WiiProfile.none
  // Pointeur Wii (maquette WiiMenu.dc.html) : mode (wii_pointer) et vitesse au stick (wii_pointer_speed).
  private var pointerMode = PointerMode.stick
  private var pointerSpeed: Float = 2
  private let motion = CMMotionManager()
  private var gyroSign: Float = 1

  init?() {
    if !GameCubeSession.ready {
      // Dossier de travail de Dolphin (cartes mémoire, cache des shaders) : gardé entre deux lancements.
      guard let folder = try? RetroFiles.folder(.documentDirectory, "gamecube"), gc_init(folder.path) else { return nil }
      GameCubeSession.ready = true
    }
    if let kept = GameCubeSession.sharedLayer {
      layer = kept
    } else {
      guard let pointer = gc_metal_layer() else { return nil }
      layer = Unmanaged<CALayer>.fromOpaque(pointer).takeUnretainedValue()
      GameCubeSession.sharedLayer = layer
    }
  }

  var state: Int32 { gc_state() }
  var isRunning: Bool { state == Int32(GC_STATE_RUNNING) || state == Int32(GC_STATE_PAUSED) }
  var isStopped: Bool { state == Int32(GC_STATE_STOPPED) }

  var lastError: String {
    var buffer = [CChar](repeating: 0, count: 512)
    gc_last_error(&buffer, Int32(buffer.count))
    return String(cString: buffer)
  }

  // Taille de la vue (en points) : Dolphin garde lui-même les proportions du jeu, bandes noires comprises.
  // Netteté de l'écran : 2 en 1× (assez net, moins lourd), 3 (celle de l'iPhone) dès 2× pour en voir le détail.
  func layout(size: CGSize) {
    gc_layout(Double(size.width), Double(size.height), resolution >= 2 ? 3 : 2)
  }

  // Résolution interne (efb_scale de Dolphin : 1 = celle de la console, 2, 3), avant ou pendant la partie.
  private var resolution = 1

  func setResolution(_ scale: Int) {
    resolution = scale
    _ = gc_set_option("efb_scale", Double(scale))
  }

  // Attend la fin d'une partie précédente (arrêt en cours), pose les réglages, puis lance le jeu.
  func start(path: String, options: [String: Double], completion: @escaping (Bool) -> Void) {
    GameCubeSession.queue.async {
      for _ in 0..<200 where gc_state() != Int32(GC_STATE_STOPPED) {
        usleep(50_000)
      }
      self.frameReady = false
      DispatchQueue.main.async {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default)
        try? session.setActive(true)
        GameCubeSession.current = self
        self.apply(options)
        gc_set_fill_screen(self.fill) // réglage de base de Dolphin : sinon celui de la partie précédente resterait
        completion(gc_start(path))
      }
    }
  }

  private func apply(_ options: [String: Double]) {
    autoClock = false
    invertCX = false
    invertCY = false
    clock = 1
    clockFloor = 0.5
    speedBeforeDrop = nil
    holdSeconds = 0
    wiiProfile = .none
    pointerMode = .stick
    pointerSpeed = 2
    pointerX = 0
    pointerY = 0
    pointerTime = 0
    GameCubeSession.touchLock.lock()
    GameCubeSession.touchPoint = nil
    GameCubeSession.touchLock.unlock()
    for (name, value) in options.sorted(by: { $0.key < $1.key }) {
      if applyWii(name, value) { continue }
      switch name {
      case "auto_clock": autoClock = value != 0
      case "cpu_clock": clock = min(1, max(0.3, value))
      case "clock_floor": clockFloor = min(1, max(0.3, value))
      case "invert_c_x": invertCX = value != 0
      case "invert_c_y": invertCY = value != 0
      default:
        if !gc_set_option(name, value) { NSLog("[GameCube] unknown option %@", name) }
      }
    }
    steadySeconds = 0
    _ = gc_set_option("wii_extension", Double(wiiExtension))
    updateGyro()
  }

  // Réglages Wii (wii_profile, wii_pointer, wii_pointer_speed) ; faux pour un autre nom.
  private func applyWii(_ name: String, _ value: Double) -> Bool {
    switch name {
    case "wii_profile": wiiProfile = WiiProfile(rawValue: Int(value)) ?? .nunchuk
    case "wii_pointer": pointerMode = PointerMode(rawValue: Int(value)) ?? .stick
    case "wii_pointer_speed": pointerSpeed = [1.2, 2, 3.2][min(2, max(0, Int(value)))] // Slow, Medium, Fast
    default: return false
    }
    return true
  }

  // Manette branchée sur la Wiimote émulée : Nunchuk, Classic Controller, ou rien (Wiimote seule, manette GameCube).
  private var wiiExtension: Int32 { wiiProfile == .nunchuk ? 1 : wiiProfile == .classic ? 2 : 0 }

  // Menu « Wii options » (WiiMenu.dc.html) : nouveaux réglages pendant la partie. Les boutons de l'ancien profil
  // sont relâchés, puis la nouvelle manette est branchée sur la Wiimote (le jeu le voit comme un vrai branchement).
  static func updateWii(_ options: [String: Double]) {
    DispatchQueue.main.async {
      guard let session = current, session.wiiProfile != .none else { return }
      let extensionBefore = session.wiiExtension
      session.send(nil, active: false, menuHeld: false)
      for (name, value) in options { _ = session.applyWii(name, value) }
      if session.wiiExtension != extensionBefore { gc_set_wii_extension(session.wiiExtension) }
      session.updateGyro()
    }
  }

  static func recenterWii() {
    DispatchQueue.main.async { current?.recenterRequested = true }
  }

  private static weak var current: GameCubeSession?

  // Gyroscope : seulement pour un profil avec pointeur. Sens selon le côté où l'iPhone est tourné (paysage).
  private func updateGyro() {
    if (wiiProfile == .nunchuk || wiiProfile == .sideways) && pointerMode == .gyro && motion.isDeviceMotionAvailable {
      let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene
      gyroSign = scene?.interfaceOrientation == .landscapeLeft ? -1 : 1
      motion.deviceMotionUpdateInterval = 1.0 / 60
      motion.startDeviceMotionUpdates()
    } else {
      motion.stopDeviceMotionUpdates()
    }
  }

  // Le jeu vient de démarrer : vitesse du processeur simulé de départ.
  func applyClock() {
    gc_set_cpu_clock(clock)
  }

  // Horloge automatique, appelée chaque seconde avec la vitesse mesurée : si le jeu rame, le processeur
  // simulé ralentit par pas de 5 % (jusqu'à clockFloor, 50 %) ; après 5 secondes à pleine vitesse, il réessaie 5 % de plus.
  // Sécurité (comme iCube) : si une baisse n'a pas fait gagner au moins 3 % de vitesse, la lenteur ne vient pas
  // du processeur simulé (cinématique en vidéo de Le Retour du Roi : 30 %, 1 à 2 images/s) : on remonte d'un
  // pas et on ne rebaisse plus pendant 15 secondes.
  private var clockFloor = 0.5
  private var speedBeforeDrop: Double?
  private var holdSeconds = 0

  func adjustClock(speed: Double) {
    guard autoClock, speed > 0 else { return }
    if holdSeconds > 0 { holdSeconds -= 1 }
    if speed < 0.97 {
      steadySeconds = 0
      if let before = speedBeforeDrop {
        speedBeforeDrop = nil
        if speed < before + 0.03 {
          clock = min(1, clock + 0.05)
          gc_set_cpu_clock(clock)
          holdSeconds = 15
          return
        }
      }
      guard holdSeconds == 0, clock > clockFloor else { return }
      speedBeforeDrop = speed
      clock = max(clockFloor, clock - 0.05)
      gc_set_cpu_clock(clock)
    } else if clock < 1 {
      speedBeforeDrop = nil
      steadySeconds += 1
      guard steadySeconds >= 5 else { return }
      steadySeconds = 0
      clock = min(1, clock + 0.05)
      gc_set_cpu_clock(clock)
    }
  }

  // Image du jeu au moment de la pause (vignette des sauvegardes d'état) : Dolphin ne la dessine plus une fois en
  // pause, elle est donc prise juste avant (le jeu tourne encore une fraction de seconde, sans la manette).
  // Pas en passant en arrière-plan (iOS n'y laisse plus dessiner). Gardée jusqu'à la reprise du jeu.
  private static let framePath = (NSTemporaryDirectory() as NSString).appendingPathComponent("gamecube-frame.png")
  private var frameReady = false // lu et écrit sur la file

  func setPaused(_ paused: Bool, capture: Bool) {
    GameCubeSession.queue.async {
      if paused, capture { self.frameReady = gc_capture_frame(GameCubeSession.framePath) }
      if !paused { self.frameReady = false }
      gc_set_paused(paused)
    }
  }

  // Image de la sauvegarde : celle de la pause, ou aucune (l'ancienne est retirée).
  private func copyFrame(to image: String?) {
    guard let image = image else { return }
    try? FileManager.default.removeItem(atPath: image)
    if frameReady { try? FileManager.default.copyItem(atPath: GameCubeSession.framePath, toPath: image) }
  }

  // Fill screen (Settings › Retro › Picture size) sans contrôles tactiles : l'image remplit l'écran sans être
  // déformée (gc_set_fill_screen : la scène 3D est élargie). Posé aussi au lancement de chaque partie.
  private var fill = false

  func setFillScreen(_ value: Bool) {
    guard value != fill else { return }
    fill = value
    gc_set_fill_screen(value)
  }

  // Sauvegarde auto (si demandée), puis arrêt complet.
  func stop(autoSave: String?, image: String?) {
    motion.stopDeviceMotionUpdates()
    GameCubeSession.queue.async {
      if let path = autoSave, gc_save_state(path) { self.copyFrame(to: image) }
      gc_stop()
    }
  }

  func save(_ path: String, image: String?, completion: @escaping (Bool) -> Void) {
    GameCubeSession.queue.async {
      let saved = gc_save_state(path)
      if saved { self.copyFrame(to: image) }
      DispatchQueue.main.async { completion(saved) }
    }
  }

  func load(_ path: String, completion: @escaping (Bool) -> Void) {
    GameCubeSession.queue.async {
      let loaded = gc_load_state(path)
      DispatchQueue.main.async { completion(loaded) }
    }
  }

  // Vitesse mesurée (1 = celle de la console) et images par seconde : sert à l'horloge automatique.
  var speed: (Double, Double) { (gc_speed(), gc_fps()) }

  // Manette → GameCube, par la lettre (demande d'Elhadji, 27/09/2026 : « appuie sur B » dans le jeu = B de la manette Xbox) :
  // A = A, B = B, X = X, Y = Y ; RB = Z (même place que sur la manette GameCube) ; LT et RT = gâchettes L et R
  // (analogiques) ; stick gauche = stick principal, stick droit = stick C ; Menu = Start.
  // Contrôles tactiles ajoutés à la manette : voir Controls. Rien n'est transmis quand active = false (jeu en pause).
  // Jeux Wii (maquette WiiControls.dc.html) : profil GameCube Controller = la vraie disposition de la manette
  // GameCube (A = A, X = B, B = X, Y = Y, RB = Z, LT / RT = L / R, Menu = Start) ; profil Classic Controller :
  // A = b, B = a, X = y, Y = x (même place), LT / RT = L / R, LB / RB = ZL / ZR, View = −, Menu = +, sticks et croix.
  func send(_ pad: GCExtendedGamepad?, active: Bool, menuHeld: Bool) {
    guard active else {
      gc_set_input(0, 0, 0, 0, 0, 0, 0)
      if wiiProfile == .classic { sendClassic(Controls()) }
      if wiiProfile == .nunchuk { sendNunchuk(Controls()) }
      if wiiProfile == .sideways { sendSideways(Controls()) }
      return
    }
    let controls = Controls(pad, menuHeld: menuHeld)
    switch wiiProfile {
    case .classic, .nunchuk, .sideways:
      gc_set_input(0, 0, 0, 0, 0, 0, 0)
      if wiiProfile == .classic { return sendClassic(controls) }
      return wiiProfile == .nunchuk ? sendNunchuk(controls) : sendSideways(controls)
    case .none, .gameCube:
      break
    }
    let wii = wiiProfile == .gameCube
    var bits: UInt32 = 0
    func press(_ bit: Int, _ on: Bool) { // les constantes d'une enum C sans nom arrivent en Int
      if on { bits |= UInt32(bit) }
    }
    // Boutons tactiles : toujours par la lettre de la manette GameCube (maquette GameCube.html).
    press(GC_BUTTON_A, controls.a || controls.touchA)
    press(GC_BUTTON_B, (wii ? controls.x : controls.b) || controls.touchB)
    press(GC_BUTTON_X, (wii ? controls.b : controls.x) || controls.touchX)
    press(GC_BUTTON_Y, controls.y || controls.touchY)
    press(GC_BUTTON_Z, controls.rb)
    press(GC_BUTTON_START, controls.menu)
    press(GC_BUTTON_UP, controls.up)
    press(GC_BUTTON_DOWN, controls.down)
    press(GC_BUTTON_LEFT, controls.left)
    press(GC_BUTTON_RIGHT, controls.right)
    gc_set_input(bits, controls.leftX, controls.leftY, controls.rightX * (invertCX ? -1 : 1),
                 controls.rightY * (invertCY ? -1 : 1), controls.lt, controls.rt)
  }

  private func sendClassic(_ c: Controls) {
    let device = Int32(GC_DEVICE_WIIMOTE)
    let buttons: [(WiiButton, Bool)] = [
      (.classicB, c.a || c.touchA), (.classicA, c.b || c.touchB), (.classicY, c.x || c.touchX), (.classicX, c.y || c.touchY),
      (.classicZL, c.lb || c.touchL2), (.classicZR, c.rb), (.classicMinus, c.view), (.classicPlus, c.menu),
      (.classicUp, c.up), (.classicDown, c.down), (.classicLeft, c.left), (.classicRight, c.right),
    ]
    for (button, on) in buttons { gc_set_button(device, button.rawValue, on) }
    // Chaque direction lit la même valeur signée (bas = +1), comme pour la manette GameCube.
    let axes: [(WiiButton, Float)] = [
      (.classicLeftStickLeft, c.leftX), (.classicLeftStickRight, c.leftX),
      (.classicLeftStickUp, c.leftY), (.classicLeftStickDown, c.leftY),
      (.classicRightStickLeft, c.rightX), (.classicRightStickRight, c.rightX),
      (.classicRightStickUp, c.rightY), (.classicRightStickDown, c.rightY),
      (.classicTriggerL, c.lt), (.classicTriggerR, c.rt),
    ]
    for (axis, value) in axes { gc_set_axis(device, axis.rawValue, value) }
  }

  // Profil Remote + Nunchuk (maquette WiiControls.dc.html) : stick gauche = stick du Nunchuk, stick droit = pointeur,
  // clic du stick droit = recentrer, A = A, RT = B, X = 1, Y = 2, LB = C, LT = Z, RB = secouer, croix, View = −, Menu = +.
  // Tactile (maquette « Wii · contrôles tactiles », validée le 06/10/2026) : stick = Nunchuk, A = A, B = B, X = 1,
  // Y = 2, L = C, R2 = Z, L2 = SHAKE, Select = −, Start = +, croix ; pointeur = toucher l'image du jeu.
  private func sendNunchuk(_ c: Controls) {
    let device = Int32(GC_DEVICE_WIIMOTE)
    let shake = c.padRB || c.touchL2
    let buttons: [(WiiButton, Bool)] = [
      (.wiimoteA, c.a || c.touchA), (.wiimoteB, c.rt > 0.5 || c.touchB), (.wiimote1, c.x || c.touchX),
      (.wiimote2, c.y || c.touchY), (.wiimoteMinus, c.view), (.wiimotePlus, c.menu),
      (.wiimoteUp, c.up), (.wiimoteDown, c.down), (.wiimoteLeft, c.left), (.wiimoteRight, c.right),
      (.nunchukC, c.lb || c.touchL), (.nunchukZ, c.padLT > 0.5 || c.touchZ),
      (.wiimoteShakeX, shake), (.wiimoteShakeY, shake), (.wiimoteShakeZ, shake),
    ]
    for (button, on) in buttons { gc_set_button(device, button.rawValue, on) }
    let axes: [(WiiButton, Float)] = [
      (.nunchukStickLeft, c.leftX), (.nunchukStickRight, c.leftX),
      (.nunchukStickUp, c.leftY), (.nunchukStickDown, c.leftY),
    ]
    for (axis, value) in axes { gc_set_axis(device, axis.rawValue, value) }
    sendPointer(c)
  }

  // Profil Sideways Remote (maquette WiiControls.dc.html) : Wiimote à l'horizontale, croix à gauche. Croix ou stick
  // gauche = croix (tournée d'un quart de tour : haut du joueur = droite de la Wiimote), A = 2, X = 1, RB = secouer,
  // View = −, Menu = +, stick droit = pointeur. Tactile (maquette du 06/10/2026) : A = 2, B = 1, L2 = SHAKE,
  // Select = −, Start = +, croix ; pointeur = toucher l'image du jeu.
  private func sendSideways(_ c: Controls) {
    let device = Int32(GC_DEVICE_WIIMOTE)
    let up = c.up || c.leftY < -0.5
    let down = c.down || c.leftY > 0.5
    let left = c.left || c.leftX < -0.5
    let right = c.right || c.leftX > 0.5
    let shake = c.rb || c.touchL2
    let buttons: [(WiiButton, Bool)] = [
      (.wiimoteRight, up), (.wiimoteLeft, down), (.wiimoteUp, left), (.wiimoteDown, right),
      (.wiimote2, c.a || c.touchA), (.wiimote1, c.x || c.touchX || c.touchB),
      (.wiimoteMinus, c.view), (.wiimotePlus, c.menu),
      (.wiimoteShakeX, shake), (.wiimoteShakeY, shake), (.wiimoteShakeZ, shake),
    ]
    for (button, on) in buttons { gc_set_button(device, button.rawValue, on) }
    sendPointer(c)
  }

  private func sendPointer(_ c: Controls) {
    let device = Int32(GC_DEVICE_WIIMOTE)
    movePointer(c)
    for axis in [WiiButton.irLeft, .irRight] { gc_set_axis(device, axis.rawValue, pointerX) }
    for axis in [WiiButton.irUp, .irDown] { gc_set_axis(device, axis.rawValue, pointerY) }
  }

  // Pointeur (maquette WiiMenu.dc.html), position de -1 à 1 sur chaque axe (bas = +1), envoyée telle quelle à Dolphin.
  // Right stick : le stick déplace le curseur, avec accélération (lent près du centre, rapide à fond) ; Medium =
  // d'un bord à l'autre en une seconde, stick à fond. Gyro + right stick : l'iPhone tourné vise (environ 40° pour
  // toute la largeur), le stick corrige. Touch : le dernier endroit touché sur l'image du jeu (setTouchPoint).
  // Clic du stick droit : retour au centre.
  private var pointerX: Float = 0
  private var pointerY: Float = 0
  private var pointerTime: CFTimeInterval = 0

  private func movePointer(_ c: Controls) {
    let now = CACurrentMediaTime()
    let elapsed = pointerTime == 0 ? 0 : Float(min(0.1, now - pointerTime))
    pointerTime = now
    let recenter = (c.recenter && !recenterHeld) || recenterRequested
    recenterHeld = c.recenter
    recenterRequested = false
    if recenter {
      pointerX = 0
      pointerY = 0
      recenters += 1
      edgeSince = nil
      return
    }
    defer { trackEdge(now) }
    // Doigt posé sur l'image du jeu : le pointeur y va, quel que soit le mode (contrôles tactiles Wii : « touch the
    // picture to aim »). En mode Touch, il y reste ; sinon le stick et le gyroscope le déplacent ensuite depuis là.
    GameCubeSession.touchLock.lock()
    let touch = GameCubeSession.touchPoint
    GameCubeSession.touchPoint = nil
    GameCubeSession.touchLock.unlock()
    if let touch = touch {
      pointerX = touch.x * 2 - 1
      pointerY = touch.y * 2 - 1
    }
    if pointerMode == .touch { return }
    func step(_ value: Float) -> Float {
      let dead: Float = 0.15
      let amount = abs(value)
      guard amount > dead else { return 0 }
      let t = (min(1, amount) - dead) / (1 - dead)
      return (value < 0 ? -1 : 1) * t * t * pointerSpeed * elapsed
    }
    var moveX = step(c.rightX)
    var moveY = step(c.rightY)
    if pointerMode == .gyro, let rate = motion.deviceMotion?.rotationRate {
      // Paysage, iPhone tourné vers la droite (interfaceOrientation .landscapeRight) : l'axe x de l'iPhone est
      // vertical (tourner à droite = rotation x négative), l'axe y horizontal (viser plus haut = rotation y négative).
      let perRadian: Float = 2 / 0.7
      moveX += gyroSign * Float(-rate.x) * perRadian * elapsed
      moveY += gyroSign * Float(rate.y) * perRadian * elapsed
    }
    pointerX = min(1, max(-1, pointerX + moveX))
    pointerY = min(1, max(-1, pointerY + moveY))
  }

  // Notices du jeu (WiiPlay.dc.html) : recentrages (clic du stick droit ou menu) et pointeur collé à un bord
  // depuis une demi-seconde (« Pointer off screen ») : « left », « right », « top », « bottom » ou nil.
  private(set) var recenters = 0
  private(set) var pointerEdge: String?
  private var recenterHeld = false
  private var recenterRequested = false
  private var edgeSince: CFTimeInterval?

  private func trackEdge(_ now: CFTimeInterval) {
    let edge: String? = pointerMode == .touch ? nil
      : pointerX >= 1 ? "right" : pointerX <= -1 ? "left" : pointerY >= 1 ? "bottom" : pointerY <= -1 ? "top" : nil
    if edge == nil {
      edgeSince = nil
      pointerEdge = nil
    } else if let since = edgeSince {
      if now - since >= 0.5 { pointerEdge = edge }
    } else {
      edgeSince = now
    }
  }

  // Mode Touch : doigt posé sur l'image du jeu (x, y de 0 à 1 depuis le coin en haut à gauche), depuis le JavaScript.
  // Le pointeur reste au dernier endroit touché.
  private static let touchLock = NSLock()
  private static var touchPoint: (x: Float, y: Float)?

  static func setTouchPoint(x: Double, y: Double) {
    touchLock.lock()
    touchPoint = (Float(min(1, max(0, x))), Float(min(1, max(0, y))))
    touchLock.unlock()
  }

  // Système d'un disque Dolphin (.iso, .rvz, .wbfs…) : « gc », « wii » ou nil (illisible, ou autre chose).
  static func discSystem(_ path: String) -> String? {
    switch gc_disc_info(path, nil, 0) {
    case Int32(GC_DISC_GAMECUBE): return "gc"
    case Int32(GC_DISC_WII): return "wii"
    default: return nil
    }
  }

  // Identifiant du jeu (ex. « RMGE01 ») d'un disque GameCube ou Wii ; nil si illisible.
  static func discGameId(_ path: String) -> String? {
    var buffer = [CChar](repeating: 0, count: 16)
    guard gc_disc_info(path, &buffer, Int32(buffer.count)) != Int32(GC_DISC_UNKNOWN) else { return nil }
    let id = String(cString: buffer)
    return id.isEmpty ? nil : id
  }
}

// Profils de commandes Wii (wii_profile, maquette WiiControls.dc.html) : Remote + Nunchuk, Classic Controller,
// GameCube Controller, Sideways Remote.
enum WiiProfile: Int {
  case none = 0 // jeu GameCube
  case nunchuk = 1
  case classic = 2
  case gameCube = 3
  case sideways = 4
}

// Modes du pointeur (wii_pointer, maquette WiiMenu.dc.html) : Right stick, Gyro + right stick, Touch.
enum PointerMode: Int {
  case stick = 0
  case gyro = 1
  case touch = 2
}

// Numéros des boutons et axes de la Wiimote émulée (ButtonType.h du backend iOS de Dolphin).
enum WiiButton: Int32 {
  case wiimoteA = 100, wiimoteB, wiimoteMinus, wiimotePlus, wiimoteHome, wiimote1, wiimote2
  case wiimoteUp = 107, wiimoteDown, wiimoteLeft, wiimoteRight
  case irUp = 112, irDown, irLeft, irRight
  case wiimoteShakeX = 132, wiimoteShakeY, wiimoteShakeZ
  case nunchukC = 200, nunchukZ
  case nunchukStickUp = 203, nunchukStickDown, nunchukStickLeft, nunchukStickRight
  case classicA = 300, classicB, classicX, classicY, classicMinus, classicPlus, classicHome, classicZL, classicZR
  case classicUp = 309, classicDown, classicLeft, classicRight
  case classicLeftStickUp = 314, classicLeftStickDown, classicLeftStickLeft, classicLeftStickRight
  case classicRightStickUp = 319, classicRightStickDown, classicRightStickLeft, classicRightStickRight
  case classicTriggerL = 323, classicTriggerR
}

// La manette et les contrôles tactiles réunis (TouchRetro, maquette GameCube.html) : bits libretro de
// rf_set_touch_buttons ajoutés à la manette : A, B, X, Y à part (touchA…) ; L et R = gâchettes enfoncées à fond ;
// R2 (Z) = RB ; Start = Menu ; Select = View ; croix. padRB, padLT, touchL, touchZ : séparés pour le profil Remote + Nunchuk.
// L2 (touchL2) : SHAKE des profils Remote, ZL du Classic Controller. Sticks tactiles (rf_touch_analog) : sur chaque axe, le plus grand mouvement entre
// la manette et l'écran l'emporte (bas = +1). View + Menu ensemble ouvrent le menu du jeu : View et Menu ne sont
// alors pas transmis (menuHeld).
private struct Controls {
  var a = false, b = false, x = false, y = false, touchA = false, touchB = false, touchX = false, touchY = false
  var lb = false, rb = false, view = false, menu = false, recenter = false
  var padRB = false, touchL = false, touchZ = false, touchL2 = false, padLT: Float = 0
  var up = false, down = false, left = false, right = false
  var leftX: Float = 0, leftY: Float = 0, rightX: Float = 0, rightY: Float = 0, lt: Float = 0, rt: Float = 0

  init() {}

  init(_ pad: GCExtendedGamepad?, menuHeld: Bool) {
    let touch = rf_touch_buttons()
    func touched(_ id: UInt16) -> Bool { touch & (1 << id) != 0 }
    a = pad?.buttonA.isPressed == true
    b = pad?.buttonB.isPressed == true
    x = pad?.buttonX.isPressed == true
    y = pad?.buttonY.isPressed == true
    touchA = touched(RetroButton.a)
    touchB = touched(RetroButton.b)
    touchX = touched(RetroButton.x)
    touchY = touched(RetroButton.y)
    lb = pad?.leftShoulder.isPressed == true
    padRB = pad?.rightShoulder.isPressed == true
    touchL = touched(RetroButton.l)
    touchZ = touched(RetroButton.r2)
    touchL2 = touched(RetroButton.l2)
    rb = padRB || touchZ
    recenter = pad?.rightThumbstickButton?.isPressed == true
    view = (pad?.buttonOptions?.isPressed == true && !menuHeld) || touched(RetroButton.select)
    menu = (pad?.buttonMenu.isPressed == true && !menuHeld) || touched(RetroButton.start)
    up = pad?.dpad.up.isPressed == true || touched(RetroButton.up)
    down = pad?.dpad.down.isPressed == true || touched(RetroButton.down)
    left = pad?.dpad.left.isPressed == true || touched(RetroButton.left)
    right = pad?.dpad.right.isPressed == true || touched(RetroButton.right)

    var sticks = [Int16](repeating: 0, count: 4)
    rf_touch_analog(&sticks)
    func larger(_ a: Float, _ b: Int16) -> Float {
      let t = Float(b) / 32767
      return abs(t) > abs(a) ? t : a
    }
    leftX = larger(pad?.leftThumbstick.xAxis.value ?? 0, sticks[0])
    leftY = larger(-(pad?.leftThumbstick.yAxis.value ?? 0), sticks[1])
    rightX = larger(pad?.rightThumbstick.xAxis.value ?? 0, sticks[2])
    rightY = larger(-(pad?.rightThumbstick.yAxis.value ?? 0), sticks[3])
    padLT = pad?.leftTrigger.value ?? 0
    lt = touchL ? 1 : padLT
    rt = touched(RetroButton.r) ? 1 : pad?.rightTrigger.value ?? 0
  }
}
