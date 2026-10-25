// src/lib/brandStudio/index.js — NEW FILE
//
// AIM
// The one place the app imports the logo and avatar maker from.
// A logo or avatar is never saved as a picture. A small recipe is saved (see designs.js) and the
// picture is drawn from it whenever it is shown (see render.js).

export { PALETTES } from "./palettes.js";
export { STYLES, STYLE_COUNT } from "./styles.js";
export { iconSet, ICON_COUNT } from "./icons/index.js";
export {
  DESIGN_VERSION, newSeed, sameDesign,
  normalizeLogoDesign, deriveLogoDesign, resolveLogoDesign, logoCandidates,
  normalizeAvatarDesign, deriveAvatarDesign, resolveAvatarDesign, avatarCandidates,
} from "./designs.js";
export { businessInitials, personInitials, logoSvg, avatarSvg, logoUri, avatarUri, svgToUri, typeCaption } from "./render.js";
export { downloadSvgAsPng, safeFileName } from "./download.js";
