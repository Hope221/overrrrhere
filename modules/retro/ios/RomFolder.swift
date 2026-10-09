import Foundation
import UIKit
import UniformTypeIdentifiers

// Dossier de ROM (maquette « Dossier iCloud », validée le 27/09/2026) : un dossier choisi une fois dans
// Fichiers (iCloud Drive), gardé d'un lancement à l'autre par un marque-page d'accès. L'app y lit la liste
// des jeux ; un jeu n'est téléchargé sur l'iPhone que pour y jouer, et peut en être retiré (il reste dans iCloud).
// Les sauvegardes des jeux du dossier sont aussi copiées dans son sous-dossier « overrrrhere saves ».
enum RomFolder {
  static let savesName = "overrrrhere saves"
  private static let bookmarkKey = "retro.romFolder"
  private static var accessed: URL? // dossier ouvert (accès accordé) pour toute la durée de l'app
  private static var cancelled = false

  // MARK: - Dossier

  static func remember(_ url: URL) throws {
    guard url.startAccessingSecurityScopedResource() else { throw CocoaError(.fileReadNoPermission) }
    let bookmark = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
    UserDefaults.standard.set(bookmark, forKey: bookmarkKey)
    accessed?.stopAccessingSecurityScopedResource()
    accessed = url
  }

  static func forget() {
    UserDefaults.standard.removeObject(forKey: bookmarkKey)
    accessed?.stopAccessingSecurityScopedResource()
    accessed = nil
  }

  // Le dossier choisi (nil si aucun, ou s'il n'existe plus).
  static func url() -> URL? {
    if let url = accessed { return url }
    guard let bookmark = UserDefaults.standard.data(forKey: bookmarkKey) else { return nil }
    var stale = false
    guard let url = try? URL(resolvingBookmarkData: bookmark, options: [], relativeTo: nil, bookmarkDataIsStale: &stale),
          url.startAccessingSecurityScopedResource()
    else { return nil }
    if stale, let fresh = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
      UserDefaults.standard.set(fresh, forKey: bookmarkKey)
    }
    accessed = url
    return url
  }

  // « iCloud Drive › Retro games » (maquette), sinon le nom du dossier seul.
  static func info() -> [String: Any]? {
    guard let url = url() else { return nil }
    let iCloud = url.path.contains("/Mobile Documents/com~apple~CloudDocs")
    let name = iCloud ? "iCloud Drive › \(url.lastPathComponent)" : url.lastPathComponent
    return ["name": name, "path": url.path]
  }

  // MARK: - Liste des jeux

  // Tous les fichiers du dossier et de ses sous-dossiers (sauf celui des sauvegardes) :
  // chemin relatif, nom, taille, déjà sur l'iPhone ou pas. Sur les anciens iOS, un fichier pas encore
  // téléchargé apparaît comme « .Nom.ext.icloud » (petit fichier de description) : on donne le vrai nom.
  static func scan() throws -> [[String: Any]] {
    guard let root = url() else { return [] }
    let keys: [URLResourceKey] = [.isDirectoryKey, .fileSizeKey, .isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey]
    guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys, options: [.skipsPackageDescendants])
    else { return [] }
    var files: [[String: Any]] = []
    let rootPath = root.resolvingSymlinksInPath().path // /var ou /private/var : même comparaison des deux côtés
    for case let file as URL in walker {
      let values = try? file.resourceValues(forKeys: Set(keys))
      if values?.isDirectory == true {
        if file.lastPathComponent == savesName || file.lastPathComponent.hasPrefix(".") { walker.skipDescendants() }
        continue
      }
      var name = file.lastPathComponent
      var size = values?.fileSize ?? 0
      var local = isLocal(values)
      if name.hasPrefix("."), name.hasSuffix(".icloud") {
        name = String(name.dropFirst().dropLast(".icloud".count))
        if let data = try? Data(contentsOf: file),
           let plist = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any] {
          size = (plist["NSURLFileSizeKey"] as? NSNumber)?.intValue ?? 0
        }
        local = false
      } else if name.hasPrefix(".") {
        continue
      }
      let parent = file.deletingLastPathComponent().resolvingSymlinksInPath().path
      let folder = parent.hasPrefix(rootPath) ? String(parent.dropFirst(rootPath.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/")) : ""
      let relative = folder.isEmpty ? name : "\(folder)/\(name)"
      files.append(["path": relative, "name": name, "size": size, "local": local])
    }
    return files
  }

  private static func isLocal(_ values: URLResourceValues?) -> Bool {
    guard values?.isUbiquitousItem == true else { return true } // « Sur mon iPhone » : toujours là
    let status = values?.ubiquitousItemDownloadingStatus
    return status == .current || status == .downloaded
  }

  static func file(_ relative: String) -> URL? {
    url()?.appendingPathComponent(relative)
  }

  // MARK: - Téléchargement

  // Demande le fichier à iCloud et attend qu'il soit sur l'iPhone ; renvoie son chemin.
  static func download(_ relative: String) throws -> String {
    guard let file = file(relative) else { throw RomFolderError.noFolder }
    cancelled = false
    var values = try? file.resourceValues(forKeys: [.isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey])
    if isLocal(values) { return file.path }
    try FileManager.default.startDownloadingUbiquitousItem(at: file)
    while true {
      if cancelled { throw RomFolderError.cancelled }
      usleep(300_000)
      var fresh = file
      fresh.removeAllCachedResourceValues()
      values = try? fresh.resourceValues(forKeys: [
        .isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey, .ubiquitousItemDownloadingErrorKey,
      ])
      if isLocal(values) { return file.path }
      if let error = values?.ubiquitousItemDownloadingError {
        NSLog("[RomFolder] download: %@", error.localizedDescription)
        throw RomFolderError.offline
      }
    }
  }

  static func cancelDownload() {
    cancelled = true
  }

  // « Remove download » : la copie de l'iPhone est retirée, le fichier reste dans iCloud.
  static func removeDownload(_ relative: String) throws {
    guard let file = file(relative) else { throw RomFolderError.noFolder }
    try FileManager.default.evictUbiquitousItem(at: file)
  }

  // MARK: - Sauvegardes

  // Sauvegardes d'un jeu (dossier de l'app) ↔ « overrrrhere saves/<chemin du jeu sans extension> » :
  // dans chaque sens, un fichier est copié s'il manque de l'autre côté ou s'il y est plus ancien.
  static func syncSaves(local: String, relative: String) {
    guard let root = url() else { return }
    let cloud = root.appendingPathComponent(savesName).appendingPathComponent((relative as NSString).deletingPathExtension)
    sync(URL(fileURLWithPath: local), cloud) { name in
      name == "game.srm" || name.hasSuffix(".state") || (name.hasSuffix(".png") && name != "cover.png")
    }
  }

  // GameCube : ses cartes mémoire (sauvegardes des jeux) sont communes à tous les jeux, dans le dossier de Dolphin.
  static func syncMemoryCards(dolphin: String) {
    guard let root = url() else { return }
    let cloud = root.appendingPathComponent(savesName).appendingPathComponent("GameCube memory cards")
    sync(URL(fileURLWithPath: dolphin).appendingPathComponent("GC"), cloud) { $0.hasSuffix(".raw") }
  }

  // Wii : la sauvegarde d'un jeu est dans la mémoire de la Wii simulée par Dolphin (Wii/title/00010000/<4 premières
  // lettres de l'identifiant du jeu, en hexadécimal>/data) ↔ « overrrrhere saves/<chemin du jeu sans extension>/Wii save ».
  static func syncWiiSave(dolphin: String, gameId: String, relative: String) {
    guard let root = url(), gameId.count >= 4 else { return }
    let title = gameId.prefix(4).unicodeScalars.map { String(format: "%02x", $0.value) }.joined()
    let local = URL(fileURLWithPath: dolphin).appendingPathComponent("Wii/title/00010000/\(title)/data")
    let cloud = root.appendingPathComponent(savesName)
      .appendingPathComponent((relative as NSString).deletingPathExtension)
      .appendingPathComponent("Wii save")
    syncTree(local, cloud)
  }

  // Comme sync, sous-dossiers compris (une sauvegarde Wii peut en avoir).
  private static func syncTree(_ local: URL, _ cloud: URL) {
    let manager = FileManager.default
    func folders(_ url: URL) -> Set<String> {
      var result = Set<String>()
      for name in (try? manager.contentsOfDirectory(atPath: url.path)) ?? [] where !name.hasPrefix(".") {
        var isFolder: ObjCBool = false
        if manager.fileExists(atPath: url.appendingPathComponent(name).path, isDirectory: &isFolder), isFolder.boolValue {
          result.insert(name)
        }
      }
      return result
    }
    let subfolders = folders(local).union(folders(cloud))
    sync(local, cloud) { !subfolders.contains($0) }
    for name in subfolders { syncTree(local.appendingPathComponent(name), cloud.appendingPathComponent(name)) }
  }

  private static func sync(_ local: URL, _ cloud: URL, keep: (String) -> Bool) {
    let manager = FileManager.default
    let coordinator = NSFileCoordinator()
    func files(_ folder: URL) -> [String: Date] {
      var result: [String: Date] = [:]
      for name in (try? manager.contentsOfDirectory(atPath: folder.path)) ?? [] {
        var real = name
        if name.hasPrefix("."), name.hasSuffix(".icloud") { real = String(name.dropFirst().dropLast(".icloud".count)) }
        guard keep(real) else { continue }
        let date = (try? folder.appendingPathComponent(name).resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
        result[real] = date ?? .distantPast
      }
      return result
    }
    let mine = files(local)
    let theirs = files(cloud)
    func copy(_ from: URL, _ to: URL) {
      try? manager.createDirectory(at: to.deletingLastPathComponent(), withIntermediateDirectories: true)
      var failure: NSError?
      coordinator.coordinate(readingItemAt: from, options: [], writingItemAt: to, options: .forReplacing, error: &failure) { source, target in
        try? manager.removeItem(at: target)
        try? manager.copyItem(at: source, to: target)
      }
      if let failure = failure { NSLog("[RomFolder] saves: %@", failure.localizedDescription) }
    }
    for (name, date) in mine where (theirs[name] ?? .distantPast) < date.addingTimeInterval(-1) {
      copy(local.appendingPathComponent(name), cloud.appendingPathComponent(name))
    }
    for (name, date) in theirs where (mine[name] ?? .distantPast) < date.addingTimeInterval(-1) {
      copy(cloud.appendingPathComponent(name), local.appendingPathComponent(name))
    }
  }
}

enum RomFolderError: Error, LocalizedError {
  case noFolder, cancelled, offline

  var errorDescription: String? {
    switch self {
    case .noFolder: return "The ROM folder can't be opened. Choose it again in Settings."
    case .cancelled: return "Cancelled."
    case .offline: return "You're offline. This game is still in iCloud."
    }
  }
}

// Sélecteur de dossier de Fichiers.
final class FolderPicker: NSObject, UIDocumentPickerDelegate {
  private let completion: (URL?) -> Void

  init(completion: @escaping (URL?) -> Void) {
    self.completion = completion
  }

  func present(from presenter: UIViewController) {
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
    picker.delegate = self
    picker.allowsMultipleSelection = false
    presenter.present(picker, animated: true)
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    completion(urls.first)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    completion(nil)
  }
}
