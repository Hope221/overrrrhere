import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

// Émulation rétro : importer des ROM depuis Fichiers et les jouer dans une vue.
// L'app ne fournit jamais de ROM : seulement les fichiers choisis par l'utilisateur.
public class RetroModule: Module {
  private var picker: RomPicker?
  private var folderPicker: FolderPicker?

  public func definition() -> ModuleDefinition {
    Name("Retro")

    // Ouvre l'app Fichiers (plusieurs fichiers à la fois). Les fichiers choisis sont copiés
    // dans un dossier d'attente de l'app ; renvoie [{ path, name, size }] (vide si annulé).
    AsyncFunction("pickRoms") { (promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("E_NO_SCREEN", "The file picker could not be opened.")
        return
      }
      let picker = RomPicker { urls in
        self.picker = nil
        do {
          promise.resolve(try urls.map { try RetroFiles.stage($0) })
        } catch {
          promise.reject("E_IMPORT", "These files could not be imported.")
        }
      }
      self.picker = picker
      picker.present(from: presenter)
    }.runOnQueue(.main)

    // Dossier de ROM (iCloud Drive) : choisi une fois, puis lu à chaque ouverture de l'app (RomFolder.swift).
    AsyncFunction("pickRomFolder") { (promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("E_NO_SCREEN", "The folder picker could not be opened.")
        return
      }
      let picker = FolderPicker { url in
        self.folderPicker = nil
        guard let url = url else { return promise.resolve(nil) }
        do {
          try RomFolder.remember(url)
          promise.resolve(RomFolder.info())
        } catch {
          promise.reject("E_FOLDER", "This folder can't be opened.")
        }
      }
      self.folderPicker = picker
      picker.present(from: presenter)
    }.runOnQueue(.main)

    Function("romFolder") { () -> [String: Any]? in
      RomFolder.info()
    }

    Function("forgetRomFolder") {
      RomFolder.forget()
    }

    AsyncFunction("scanRomFolder") { () throws -> [[String: Any]] in
      try RomFolder.scan()
    }.runOnQueue(RomFolderQueue.work)

    // Attend que le jeu soit sur l'iPhone (cancelDownload l'interrompt) ; renvoie le chemin du fichier.
    AsyncFunction("downloadRom") { (relative: String) throws -> String in
      try RomFolder.download(relative)
    }.runOnQueue(RomFolderQueue.download)

    Function("cancelDownload") {
      RomFolder.cancelDownload()
    }

    AsyncFunction("removeDownload") { (relative: String) throws in
      try RomFolder.removeDownload(relative)
    }.runOnQueue(RomFolderQueue.work)

    AsyncFunction("syncSaves") { (local: String, relative: String) in
      RomFolder.syncSaves(local: local, relative: relative)
    }.runOnQueue(RomFolderQueue.work)

    AsyncFunction("syncMemoryCards") {
      if let dolphin = try? RetroFiles.folder(.documentDirectory, "gamecube") {
        RomFolder.syncMemoryCards(dolphin: dolphin.path)
      }
    }.runOnQueue(RomFolderQueue.work)

    // Wii : sauvegarde d'un jeu du dossier de ROM (identifiant du disque, ex. « RMGE01 ») ↔ « overrrrhere saves ».
    AsyncFunction("syncWiiSave") { (gameId: String, relative: String) in
      if let dolphin = try? RetroFiles.folder(.documentDirectory, "gamecube") {
        RomFolder.syncWiiSave(dolphin: dolphin.path, gameId: gameId, relative: relative)
      }
    }.runOnQueue(RomFolderQueue.work)

    // Disque (.iso, .rvz, .wbfs…) : GameCube, Wii, image de la PSP, ou autre chose : « gc », « wii », « psp » ou nil.
    Function("discSystem") { (path: String) -> String? in
      RetroFiles.discSystem(path)
    }

    // Disque GameCube ou Wii : identifiant du jeu (ex. « RMGE01 »), ou nil.
    Function("discGameId") { (path: String) -> String? in
      GameCubeSession.discGameId(path)
    }

    // Wii, pointeur en mode Touch : doigt posé sur l'image du jeu (x, y de 0 à 1).
    Function("setWiiPointer") { (x: Double, y: Double) in
      GameCubeSession.setTouchPoint(x: x, y: y)
    }

    // Wii : réglages changés dans « Wii options » pendant la partie (wii_profile, wii_pointer, wii_pointer_speed).
    Function("setWiiControls") { (options: [String: Double]) in
      GameCubeSession.updateWii(options)
    }

    Function("recenterWiiPointer") {
      GameCubeSession.recenterWii()
    }

    // Sauvegardes d'état du jeu en cours (menu du jeu) : fichier d'état + image PNG de l'instant.
    // GameCube : la réponse arrive quand Dolphin a fini (sur ses propres fils).
    AsyncFunction("saveState") { (statePath: String, imagePath: String?, promise: Promise) in
      guard let view = RetroView.active else { return promise.resolve(false) }
      view.saveState(statePath: statePath, imagePath: imagePath) { promise.resolve($0) }
    }.runOnQueue(.main)

    AsyncFunction("loadState") { (statePath: String, promise: Promise) in
      guard let view = RetroView.active else { return promise.resolve(false) }
      view.loadState(statePath: statePath) { promise.resolve($0) }
    }.runOnQueue(.main)

    // Boutons tactiles (TouchRetro) : bits RETRO_DEVICE_ID_JOYPAD_*, ajoutés à la manette.
    Function("setTouchButtons") { (bits: Int) in
      rf_set_touch_buttons(UInt16(truncatingIfNeeded: bits))
    }

    // Sticks tactiles (N64 : stick gauche, et boutons C = stick droit) : de -1 à 1, bas = +1.
    Function("setTouchSticks") { (leftX: Double, leftY: Double, rightX: Double, rightY: Double) in
      func axis(_ value: Double) -> Int16 {
        Int16(max(-1, min(1, value)) * 32767)
      }
      rf_set_touch_analog(axis(leftX), axis(leftY), axis(rightX), axis(rightY))
    }

    // DS et 3DS : doigt sur l'écran tactile (celui du bas), x et y de 0 à 1 depuis son coin en haut à gauche.
    Function("setTouchScreen") { (pressed: Bool, x: Double, y: Double) in
      rf_set_touch_screen(pressed, x, y)
    }

    // DS : souffle dans le micro (son intégré) tant que on = true (A tenu sur la ligne « Blow » du menu).
    Function("setBlow") { (on: Bool) in
      rf_set_blow(on)
    }

    // DS : ferme ou ouvre le couvercle (« Close the lid »).
    Function("setLidClosed") { (closed: Bool) in
      rf_set_lid_closed(closed)
    }

    View(RetroView.self) {
      Events("onError", "onMenu", "onStart", "onSwapScreens", "onWiiPointer")

      // GameCube : à poser avec romPath (le jeu démarre une fois tous les réglages reçus).
      Prop("gameCube") { (view: RetroView, on: Bool?) in
        view.setGameCube(on ?? false)
      }
      // GameCube et Wii : réglages envoyés à Dolphin au lancement (RetroPlayScreen, GAMECUBE_OPTIONS ; Wii : src/retro/wii.ts).
      Prop("gameCubeOptions") { (view: RetroView, options: [String: Double]?) in
        view.setGameCubeOptions(options)
      }
      // Résolution interne (1, 2, 3) : 3DS au lancement ; GameCube et Wii, aussi pendant la partie.
      Prop("resolution") { (view: RetroView, scale: Int?) in
        view.setResolution(scale ?? 1)
      }
      Prop("romPath") { (view: RetroView, path: String?) in
        view.setRomPath(path)
      }
      Prop("sramPath") { (view: RetroView, path: String?) in
        view.setSramPath(path)
      }
      Prop("startStatePath") { (view: RetroView, path: String?) in
        view.setStartStatePath(path)
      }
      Prop("autoSave") { (view: RetroView, paths: [String]?) in
        view.setAutoSave(state: paths?.first, image: paths?.dropFirst().first)
      }
      Prop("paused") { (view: RetroView, paused: Bool?) in
        view.setPaused(paused ?? false)
      }
      Prop("fastForward") { (view: RetroView, on: Bool?) in
        view.setFastForward(on ?? false)
      }
      Prop("screenMode") { (view: RetroView, mode: String?) in
        view.setScreenMode(mode ?? "Sharp")
      }
      Prop("fillScreen") { (view: RetroView, fill: Bool?) in
        view.setFillScreen(fill ?? false)
      }
      Prop("touchControls") { (view: RetroView, on: Bool?) in
        view.setTouchControls(on ?? false)
      }
      Prop("touchOverImage") { (view: RetroView, on: Bool?) in
        view.setTouchOverImage(on ?? false)
      }
      Prop("dualScreen") { (view: RetroView, values: [Double]?) in
        view.setDualScreen(values)
      }
    }
  }
}

// Files du dossier de ROM : le téléchargement (qui attend) ne bloque ni la liste ni les sauvegardes.
enum RomFolderQueue {
  static let work = DispatchQueue(label: "overrrrhere.romfolder")
  static let download = DispatchQueue(label: "overrrrhere.romfolder.download")
}

// Dossiers de l'app.
enum RetroFiles {
  static func folder(_ base: FileManager.SearchPathDirectory, _ name: String) throws -> URL {
    let root = try FileManager.default.url(for: base, in: .userDomainMask, appropriateFor: nil, create: true)
    let url = root.appendingPathComponent(name, isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  // Fichier choisi dans Fichiers → dossier d'attente (Caches/retro-import), en attendant « Add to library ».
  static func stage(_ source: URL) throws -> [String: Any] {
    let folder = try folder(.cachesDirectory, "retro-import")
    let destination = folder.appendingPathComponent(UUID().uuidString + "-" + source.lastPathComponent)
    try FileManager.default.moveItem(at: source, to: destination)
    let size = (try? FileManager.default.attributesOfItem(atPath: destination.path)[.size] as? NSNumber)?.intValue ?? 0
    return ["path": destination.path, "name": source.lastPathComponent, "size": size]
  }

  // Dossier système des cores (PSP) : les fichiers de PPSSPP (polices de la PSP, textes de ses fenêtres…),
  // livrés dans l'app (prebuilt/RetroSystem, copié par CocoaPods à la racine de l'app), recopiés dans Caches
  // à chaque nouveau build de l'app : PPSSPP les lit dans <dossier>/PPSSPP et le dossier de l'app est en lecture seule.
  static func systemDirectory() throws -> String {
    let folder = try folder(.cachesDirectory, "retro-system")
    let marker = folder.appendingPathComponent("build.txt")
    let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
    let target = folder.appendingPathComponent("PPSSPP", isDirectory: true)
    let ready = FileManager.default.fileExists(atPath: target.appendingPathComponent("compat.ini").path)
    if ready, (try? String(contentsOf: marker, encoding: .utf8)) == build { return folder.path }

    let bundles = [Bundle.main, Bundle(for: RetroView.self)]
    guard let source = bundles.lazy.compactMap({ $0.url(forResource: "RetroSystem", withExtension: nil) }).first else {
      throw CocoaError(.fileNoSuchFile)
    }
    try? FileManager.default.removeItem(at: target)
    try FileManager.default.copyItem(at: source.appendingPathComponent("PPSSPP", isDirectory: true), to: target)
    try build.write(to: marker, atomically: true, encoding: .utf8)
    return folder.path
  }

  // Disque GameCube ou Wii, tel quel ou compressé (.iso, .rvz, .wbfs…) : lu par Dolphin (GameCubeSession).
  // Sinon, image PSP : système de fichiers ISO 9660 (« CD001 » à l'octet 0x8001).
  static func discSystem(_ path: String) -> String? {
    if let disc = GameCubeSession.discSystem(path) { return disc }
    guard let file = FileHandle(forReadingAtPath: path) else { return nil }
    defer { try? file.close() }
    guard let head = try? file.read(upToCount: 0x8006), head.count >= 0x8006 else { return nil }
    let bytes = [UInt8](head)
    if String(bytes: bytes[0x8001..<0x8006], encoding: .ascii) == "CD001" { return "psp" }
    return nil
  }

  // Sauvegarde de la cartouche quand le JavaScript n'en donne pas : même nom que la ROM, en .srm.
  static func savePath(forRom rom: String) throws -> String {
    let name = URL(fileURLWithPath: rom).deletingPathExtension().lastPathComponent
    return try folder(.documentDirectory, "saves").appendingPathComponent(name + ".srm").path
  }
}

// Sélecteur de l'app Fichiers ; « asCopy » : iOS nous donne des copies, sans autorisation à gérer.
final class RomPicker: NSObject, UIDocumentPickerDelegate {
  private let completion: ([URL]) -> Void

  init(completion: @escaping ([URL]) -> Void) {
    self.completion = completion
  }

  func present(from presenter: UIViewController) {
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.data], asCopy: true)
    picker.delegate = self
    picker.allowsMultipleSelection = true
    presenter.present(picker, animated: true)
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    completion(urls)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    completion([])
  }
}
