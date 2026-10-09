/* Remplace le version.c que CMake génère à partir de src/core/version.c.in (mGBA, MPL 2.0).
 * Source : https://github.com/libretro/mgba, commit 7a12d6d4b9acb14c0ae62c9166b6a2f3d08007f6 (16/09/2026). */
#include <mgba/core/version.h>

MGBA_EXPORT const char* const gitCommit = "7a12d6d4b9acb14c0ae62c9166b6a2f3d08007f6";
MGBA_EXPORT const char* const gitCommitShort = "7a12d6d";
MGBA_EXPORT const char* const gitBranch = "master";
MGBA_EXPORT const int gitRevision = -1;
MGBA_EXPORT const char* const binaryName = "mgba";
MGBA_EXPORT const char* const projectName = "mGBA";
MGBA_EXPORT const char* const projectVersion = "0.11.0";
