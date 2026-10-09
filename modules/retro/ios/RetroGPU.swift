import OpenGLES
import QuartzCore
import UIKit

// Jeux 3D (N64, PSP) : le core dessine avec le processeur graphique (OpenGL ES 3) et tourne sur son propre fil,
// pour que ses images, plus lourdes qu'une image 2D, ne fassent pas saccader l'interface.
// Apple déclare OpenGL ES « ancien » depuis iOS 12, mais il fonctionne toujours ; les cores N64 et PSP
// de libretro savent s'en servir.

// Fil d'émulation : un seul fil système, toujours le même, car le contexte OpenGL et le core
// (qui change de pile avec libco) y restent attachés. Les tâches passent une par une, dans l'ordre.
final class EmulationThread: Thread {
  private let condition = NSCondition()
  private var jobs: [() -> Void] = []
  private var stopping = false // « finished » est déjà une propriété de Thread

  override init() {
    super.init()
    name = "overrrrhere.emulation"
    stackSize = 8 << 20 // 8 Mo, comme le fil principal : le rendu 3D du core est gourmand
    qualityOfService = .userInteractive
  }

  override func main() {
    while true {
      condition.lock()
      while jobs.isEmpty && !stopping { condition.wait() }
      if jobs.isEmpty {
        condition.unlock()
        return
      }
      let job = jobs.removeFirst()
      condition.unlock()
      autoreleasepool { job() }
    }
  }

  func async(_ job: @escaping () -> Void) {
    condition.lock()
    jobs.append(job)
    condition.signal()
    condition.unlock()
  }

  // Attend la fin de la tâche (et de celles d'avant) ; directement si on est déjà sur ce fil.
  @discardableResult
  func sync<T>(_ job: @escaping () -> T) -> T {
    if Thread.current === self { return job() }
    var result: T?
    let done = DispatchSemaphore(value: 0)
    async {
      result = job()
      done.signal()
    }
    done.wait()
    return result!
  }

  // Termine les tâches en attente puis s'arrête.
  func finish() {
    condition.lock()
    stopping = true
    condition.signal()
    condition.unlock()
  }
}

// Valeur partagée entre le fil principal et le fil d'émulation.
final class Locked<Value> {
  private let lock = NSLock()
  private var value: Value

  init(_ value: Value) {
    self.value = value
  }

  var current: Value {
    get {
      lock.lock()
      defer { lock.unlock() }
      return value
    }
    set {
      lock.lock()
      value = newValue
      lock.unlock()
    }
  }
}

// Image BGRA 32 bits (tableau du frontend) → CGImage, avec sa propre copie des pixels.
enum RetroImage {
  static func make(_ pixels: UnsafePointer<UInt32>, width: UInt32, height: UInt32) -> CGImage? {
    let bytesPerRow = Int(width) * 4
    guard
      let data = CFDataCreate(nil, UnsafeRawPointer(pixels).assumingMemoryBound(to: UInt8.self), bytesPerRow * Int(height)),
      let provider = CGDataProvider(data: data)
    else { return nil }
    return CGImage(
      width: Int(width), height: Int(height), bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: bytesPerRow,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue),
      provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
  }

  // Dernière image 2D du jeu (rf_frame), si le core en a produit une nouvelle. Sur le fil du core.
  static func latest() -> CGImage? {
    var width: UInt32 = 0
    var height: UInt32 = 0
    guard let pixels = rf_frame(&width, &height), width > 0, height > 0 else { return nil }
    return make(pixels, width: width, height: height)
  }
}

// Jeux 2D sur le fil d'émulation (Nintendo DS, et 3DS dont l'image Vulkan arrive en 2D) :
// fait tourner `count` images du jeu, garde la dernière. sticks : 3DS seulement (Circle Pad, stick C).
enum RetroSoftware {
  static func run(_ count: Int, buttons: UInt16, sticks: [Int16]?) -> RetroGPU.Frame {
    if let sticks = sticks {
      rf_set_analog(sticks[0], sticks[1], sticks[2], sticks[3])
    }
    for _ in 0..<count {
      rf_run_frame(buttons)
    }
    var frame = RetroGPU.Frame()
    if rf_game_failed() {
      frame.failed = true
      return frame
    }
    frame.image = RetroImage.latest()
    return frame
  }
}

// Affichage d'un jeu 3D. Deux contextes OpenGL qui partagent leurs images : celui du jeu (le core y garde
// son état) et celui de l'écran, qui recopie l'image du jeu dans `layer`. Tout se passe sur le fil
// d'émulation, sauf la taille de `layer`, posée par le fil principal.
final class RetroGPU {
  let layer = CAEAGLLayer()
  let smooth = Locked(false) // Smooth / CRT : image lissée ; Sharp : pixels nets
  let pixelSize = Locked(CGSize.zero) // taille de `layer` en pixels

  private let gameContext: EAGLContext
  private let displayContext: EAGLContext
  private var drawableSize = CGSize.zero
  private var drawableReady = false
  private var framesSinceBackdrop = 0

  private static let renderbuffer = 0x8D41 // GL_RENDERBUFFER

  init?() {
    guard
      let game = EAGLContext(api: .openGLES3),
      let display = EAGLContext(api: .openGLES3, sharegroup: game.sharegroup)
    else { return nil }
    gameContext = game
    displayContext = display
    layer.isOpaque = true
    layer.contentsScale = UIScreen.main.scale
    layer.drawableProperties = [
      kEAGLDrawablePropertyRetainedBacking: false,
      kEAGLDrawablePropertyColorFormat: kEAGLColorFormatRGBA8,
    ]
    layer.actions = ["bounds": NSNull(), "position": NSNull()]
  }

  // À appeler sur le fil d'émulation avant rf_load_game.
  func makeGameContextCurrent() {
    EAGLContext.setCurrent(gameContext)
  }

  // Affiche la dernière image du jeu ; false si rien à afficher.
  @discardableResult
  func present() -> Bool {
    rf_gpu_flush()
    EAGLContext.setCurrent(displayContext)
    defer { EAGLContext.setCurrent(gameContext) }
    let size = pixelSize.current
    guard size.width >= 1, size.height >= 1 else { return false }
    if size != drawableSize {
      rf_display_bind_renderbuffer()
      drawableReady = displayContext.renderbufferStorage(RetroGPU.renderbuffer, from: layer) && rf_display_attach()
      drawableSize = size
    }
    guard drawableReady, rf_display_draw(smooth.current) else { return false }
    return displayContext.presentRenderbuffer(RetroGPU.renderbuffer)
  }

  // Dernière image du jeu (vignette de sauvegarde, fond flou) ; nil si le jeu n'en a pas encore dessiné.
  func snapshot() -> CGImage? {
    rf_gpu_flush()
    EAGLContext.setCurrent(displayContext)
    defer { EAGLContext.setCurrent(gameContext) }
    var width: UInt32 = 0
    var height: UInt32 = 0
    guard let pixels = rf_display_snapshot(&width, &height) else { return nil }
    return RetroImage.make(pixels, width: width, height: height)
  }

  // Après rf_unload_game, sur le fil d'émulation.
  func teardown() {
    EAGLContext.setCurrent(displayContext)
    rf_display_release()
    EAGLContext.setCurrent(nil)
  }

  struct Frame {
    var image: CGImage? // image 2D (si le core ne dessine pas en 3D : moteur Angrylion, DS), affichée par la vue
    var backdrop: CGImage? // image pour le fond flou des côtés, toutes les 30 images
    var failed = false // le core a arrêté le jeu (rf_game_failed)
  }

  // Fait tourner `count` images du jeu, puis affiche la dernière.
  func run(_ count: Int, buttons: UInt16, sticks: [Int16], backdrop wantsBackdrop: Bool) -> Frame {
    rf_set_analog(sticks[0], sticks[1], sticks[2], sticks[3])
    for _ in 0..<count {
      rf_run_frame(buttons)
    }

    var frame = Frame()
    if rf_game_failed() {
      frame.failed = true
      return frame
    }
    if rf_hw_active() {
      present()
      framesSinceBackdrop += 1
      if wantsBackdrop && framesSinceBackdrop >= 30 {
        framesSinceBackdrop = 0
        frame.backdrop = snapshot()
      }
    } else {
      frame.image = RetroImage.latest()
    }
    return frame
  }
}
