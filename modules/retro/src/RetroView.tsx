import { requireNativeView } from 'expo';

import { RetroViewProps } from './Retro.types';

export const RetroView = requireNativeView<RetroViewProps>('Retro');
