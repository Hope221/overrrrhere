# overrrrhere

Your games, over here. An iPhone app for mobile controllers: stream the games installed on **your own Xbox**, and play **your own retro games**, all from a launcher built for the controller.

- **Xbox Remote Play**: pick a game installed on your console, press A, and it streams inside the app.
- **Retro games**: NES, Super Nintendo, Game Boy / Color / Advance, Mega Drive, Nintendo 64, PSP, Nintendo DS, Nintendo 3DS, GameCube and Wii. 100 % without JIT.
- **Touch controls** when no controller is connected.

iOS only, landscape only. Built with Expo (React Native) and native Swift / C modules.

## No games included

overrrrhere does not include, download or link to any game. You add your own ROM files from the Files app, or from your own iCloud Drive folder.

## Not affiliated with Microsoft

overrrrhere is not affiliated with, endorsed or sponsored by Microsoft. Xbox is a trademark of Microsoft Corporation. Other names belong to their owners. The Xbox connections used by the app are not official and may change at any time.

## Privacy

Everything stays on your iPhone. There is no overrrrhere server and no analytics.

- Your Microsoft sign-in is kept in the iPhone's secure storage (Keychain) and only sent to Microsoft and Xbox services.
- Retro covers are looked up by game name in the public [libretro-thumbnails](https://thumbnails.libretro.com) library.
- If you choose an iCloud Drive ROM folder, the app copies the saves of the games you play from it into that folder, which is yours.

## License

The code of overrrrhere is released under the **GNU General Public License v3** (see [LICENSE](LICENSE)).

It includes third-party components under their own licenses, all listed in the app (Settings › About › Open-source licenses) with their full texts (`src/licenseTexts.ts`):

| Component | Used for | License |
|---|---|---|
| FCEUmm | NES | GPL v2 |
| Snes9x | Super Nintendo | Snes9x license (non-commercial) |
| mGBA | Game Boy · Color · Advance | MPL 2.0 |
| Genesis Plus GX | Mega Drive | Genesis Plus GX license (non-commercial) |
| Mupen64Plus-Next | Nintendo 64 | GPL v2 |
| PPSSPP | PSP | GPL v2 or later |
| melonDS DS | Nintendo DS | GPL v3 (free BIOS: BSD 2-Clause) |
| Azahar | Nintendo 3DS | GPL v2 |
| Dolphin (iCube) | GameCube · Wii | GPL v2 or later — [bridge and build](https://github.com/Hope221/overrrrhere-gamecube) |
| libretro API | Emulator interface | MIT |
| MoltenVK | 3D graphics | Apache 2.0 |
| WebRTC, react-native-webrtc | Xbox streaming | BSD 3-Clause, MIT |
| React Native, Expo | App framework | MIT |
| Figtree, Bricolage Grotesque | Fonts | SIL Open Font License 1.1 |
| Interface sounds (Lokif, ObsydianX) | Menu sounds | CC0 |

Because Snes9x and Genesis Plus GX forbid commercial use, overrrrhere is and stays **free**.

The pre-built emulator cores and where each one comes from are documented in [`modules/retro/ios/prebuilt/LISEZMOI.md`](modules/retro/ios/prebuilt/LISEZMOI.md).

## Not in this repository

- **The startup sound** comes from the Soundly library, whose license does not allow sharing the file on its own. `assets/sounds/startup.wav` is a silent placeholder here.

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability privately.
