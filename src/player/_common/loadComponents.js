/**
 * Back-compat entry: player chrome is registered from `src/player/components/shell-loader.js`.
 * Keep this path so existing HTML `<script src="../_common/loadComponents.js">` keeps working.
 */
require('../components/shell-loader');
