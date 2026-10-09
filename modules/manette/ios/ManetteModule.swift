import ExpoModulesCore
import GameController

// Lit la manette avec le framework GameController d'Apple
// et envoie chaque changement au JavaScript.
public class ManetteModule: Module {
  private var observers: [NSObjectProtocol] = []
  private var lastStick: [String: (Float, Float)] = [:]
  private var lastTrigger: [String: Float] = [:]

  public func definition() -> ModuleDefinition {
    Name("Manette")

    Events("onConnectionChange", "onButton", "onStick", "onTrigger")

    OnCreate {
      DispatchQueue.main.async { self.startListening() }
    }

    OnDestroy {
      self.observers.forEach { NotificationCenter.default.removeObserver($0) }
      self.observers.removeAll()
    }

    // État actuel, pour l'affichage au démarrage de l'écran.
    // GameController se lit sur le fil principal (hors de lui, la liste peut revenir vide).
    Function("getController") { () -> [String: Any] in
      if Thread.isMainThread { return self.connectionState(excluding: nil) }
      return DispatchQueue.main.sync { self.connectionState(excluding: nil) }
    }
  }

  private func startListening() {
    let center = NotificationCenter.default

    observers.append(center.addObserver(forName: .GCControllerDidConnect, object: nil, queue: .main) { [weak self] note in
      guard let self = self, let controller = note.object as? GCController else { return }
      self.attach(controller)
      self.sendEvent("onConnectionChange", self.connectionState(excluding: nil))
    })

    observers.append(center.addObserver(forName: .GCControllerDidDisconnect, object: nil, queue: .main) { [weak self] note in
      guard let self = self else { return }
      self.sendEvent("onConnectionChange", self.connectionState(excluding: note.object as? GCController))
    })

    // Manette déjà connectée avant l'ouverture de l'app : on l'écoute et on annonce son état.
    GCController.controllers().forEach { attach($0) }
    sendEvent("onConnectionChange", connectionState(excluding: nil))
  }

  private func connectionState(excluding gone: GCController?) -> [String: Any] {
    let pad = GCController.controllers().first { $0 !== gone && $0.extendedGamepad != nil }
    return [
      "connected": pad != nil,
      "name": pad?.vendorName ?? ""
    ]
  }

  private func attach(_ controller: GCController) {
    guard let pad = controller.extendedGamepad else { return }

    // Mêmes noms que l'écran « Test buttons » du design.
    let buttons: [(String, GCControllerButtonInput?)] = [
      ("A", pad.buttonA), ("B", pad.buttonB), ("X", pad.buttonX), ("Y", pad.buttonY),
      ("LB", pad.leftShoulder), ("RB", pad.rightShoulder),
      ("LT", pad.leftTrigger), ("RT", pad.rightTrigger),
      ("Up", pad.dpad.up), ("Down", pad.dpad.down), ("Left", pad.dpad.left), ("Right", pad.dpad.right),
      ("LS", pad.leftThumbstickButton), ("RS", pad.rightThumbstickButton),
      ("Menu", pad.buttonMenu), ("View", pad.buttonOptions)
    ]

    for (name, input) in buttons {
      input?.pressedChangedHandler = { [weak self] _, value, pressed in
        self?.sendEvent("onButton", ["button": name, "pressed": pressed, "value": value])
      }
    }

    pad.leftThumbstick.valueChangedHandler = { [weak self] _, x, y in
      self?.sendStick("LS", x, y)
    }
    pad.rightThumbstick.valueChangedHandler = { [weak self] _, x, y in
      self?.sendStick("RS", x, y)
    }

    // Gâchettes progressives (0 à 1), en plus de l'appui simple envoyé par onButton.
    pad.leftTrigger.valueChangedHandler = { [weak self] _, value, _ in
      self?.sendTrigger("LT", value)
    }
    pad.rightTrigger.valueChangedHandler = { [weak self] _, value, _ in
      self?.sendTrigger("RT", value)
    }
  }

  private func sendTrigger(_ name: String, _ value: Float) {
    let rounded = (value * 100).rounded() / 100
    if lastTrigger[name] == rounded { return }
    lastTrigger[name] = rounded
    sendEvent("onTrigger", ["trigger": name, "value": rounded])
  }

  // Arrondi à 0,01 et envoi seulement si la position change, pour ne pas inonder le JavaScript.
  private func sendStick(_ name: String, _ x: Float, _ y: Float) {
    let rx = (x * 100).rounded() / 100
    let ry = (y * 100).rounded() / 100
    if let last = lastStick[name], last.0 == rx, last.1 == ry { return }
    lastStick[name] = (rx, ry)
    sendEvent("onStick", ["stick": name, "x": rx, "y": ry])
  }
}
