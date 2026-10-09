import { NativeModule, requireNativeModule } from 'expo';

import { ConnectionEvent, ManetteModuleEvents } from './Manette.types';

declare class ManetteModule extends NativeModule<ManetteModuleEvents> {
  getController(): ConnectionEvent;
}

export default requireNativeModule<ManetteModule>('Manette');
