// App name and credits (a brand and a person's name: the same in every language, so not in the i18n dictionaries).
export const APP_NAME = 'FIFA Patch Extractor'
export const AUTHOR_NAME = 'Bruno Sajermann'
export const AUTHOR_GITHUB = 'https://github.com/Sajermann'
export const REPO_URL = 'https://github.com/Sajermann/fifa-patch-extractor'
export const DONATE_URL = 'https://ko-fi.com/brunosajermann'

declare const __APP_VERSION__: string // set by vite.config.ts from desktop/src-tauri/tauri.conf.json
export const APP_VERSION = __APP_VERSION__
