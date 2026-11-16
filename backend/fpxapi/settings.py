"""Paths and the local user configuration (config.json in the data folder, never in git)."""
import json
import logging
import os
import sys
from typing import Literal, Optional

from pydantic import BaseModel

log = logging.getLogger('fpxapi')

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_DIR = os.path.dirname(BACKEND_DIR)
CORE_DIR = os.path.join(APP_DIR, 'core')
FROZEN = getattr(sys, 'frozen', False)  # packaged backend (PyInstaller, desktop app)
FRONTEND_DIST = (os.path.join(sys._MEIPASS, 'frontend_dist') if FROZEN
                 else os.path.join(APP_DIR, 'frontend', 'dist'))
# the app's own data (config, basket, selections, exports): backend/data in development; the desktop app sets it
DATA_DIR = os.environ.get('FPX_DATA_DIR') or (
    os.path.join(os.path.dirname(sys.executable), 'data') if FROZEN else os.path.join(BACKEND_DIR, 'data'))
CONFIG_PATH = os.environ.get('FPX_CONFIG', os.path.join(DATA_DIR, 'config.json'))
LOG_DIR = os.path.join(DATA_DIR, 'logs')
APP_VERSION = os.environ.get('FPX_APP_VERSION', '0.0.0')
MAX_RECENT = 8

if CORE_DIR not in sys.path:
    sys.path.insert(0, CORE_DIR)

Language = Literal['pt-BR', 'en']


class Config(BaseModel):
    language: Optional[Language] = None  # interface language
    source_dir: Optional[str] = None  # the game folder loaded last (opened again when the app starts)
    recent_sources: list[str] = []
    game_language: str = 'eng_us'  # language database the names are read from (data/loc/<language>.db)
    output_dir: Optional[str] = None  # where packages are written (None = <data>/exports)

    def exports_dir(self) -> str:
        return self.output_dir or os.path.join(DATA_DIR, 'exports')


def load() -> Config:
    try:
        with open(CONFIG_PATH, encoding='utf-8') as f:
            return Config.model_validate(json.load(f))
    except FileNotFoundError:
        return Config()
    except (OSError, ValueError) as e:  # a damaged file: start with the defaults, keep the file for the user
        log.warning('config.json not read (%s): using the defaults', e)
        return Config()


def save(cfg: Config) -> Config:
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    tmp = CONFIG_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(cfg.model_dump(), f, ensure_ascii=False, indent=2)
    os.replace(tmp, CONFIG_PATH)
    return cfg


def remember_source(cfg: Config, path: str) -> Config:
    cfg.source_dir = path
    cfg.recent_sources = [path] + [p for p in cfg.recent_sources if os.path.normcase(p) != os.path.normcase(path)]
    cfg.recent_sources = cfg.recent_sources[:MAX_RECENT]
    return save(cfg)
