"""The files of a FIFA PC installation as the game sees them: loose files under the game folder first, then the BIG
archives (patch.big before the others, higher numbers first). Read-only: nothing here ever writes to the game folder.

Paths are game paths: relative to the game folder (the one with the .big files), lower case, '/' separators, e.g.
'data/db/fifa_ng_db.db'.
"""
import os
import re

from . import chunk
from .big import BigArchive, BigError, normalize

DATABASE = 'data/db/fifa_ng_db.db'


def _archive_order(name: str):
    """patch.big first, then dataN.big with the highest N first, then the rest by name."""
    low = name.lower()
    if low == 'patch.big':
        return (0, 0, low)
    m = re.fullmatch(r'data(\d+)\.big', low)
    if m:
        return (1, -int(m.group(1)), low)
    return (2, 0, low)


def find_game_dir(path: str) -> str:
    """The game folder (the one holding 'data' and/or the .big archives) from the folder the user picked: the
    installation root, its 'Game' folder or the game folder itself."""
    if not path or not os.path.isdir(path):
        raise FileNotFoundError(path)
    for candidate in (path, os.path.join(path, 'Game')):
        if not os.path.isdir(candidate):
            continue
        has_db = os.path.isfile(os.path.join(candidate, 'data', 'db', 'fifa_ng_db.db'))
        has_big = any(n.lower().endswith('.big') for n in os.listdir(candidate))
        if has_db or has_big:
            return os.path.abspath(candidate)
    raise FileNotFoundError(path)


class GameFiles:
    def __init__(self, root: str):
        self.root = find_game_dir(root)
        self._loose = self._index_loose()
        self.archives: list[BigArchive] = []
        self.skipped: list[str] = []  # archives that could not be read
        for path in self._archive_paths():
            try:
                self.archives.append(BigArchive(path))
            except (BigError, OSError) as e:
                self.skipped.append(f'{os.path.basename(path)}: {e}')

    def _index_loose(self) -> dict[str, str]:
        """game path -> file on disk, for every loose file under data/."""
        out = {}
        data = os.path.join(self.root, 'data')
        for folder, _, files in os.walk(data):
            for name in files:
                full = os.path.join(folder, name)
                out[normalize(os.path.relpath(full, self.root))] = full
        return out

    def _archive_paths(self) -> list[str]:
        found = [os.path.join(self.root, n) for n in os.listdir(self.root) if n.lower().endswith('.big')]
        found.sort(key=lambda p: _archive_order(os.path.basename(p)))
        # archives inside data/ (e.g. the language archive data/loc/locale.big) come after the root ones
        nested = sorted(p for k, p in self._loose.items() if k.endswith('.big'))
        return found + nested

    def where(self, path: str) -> str | None:
        """'loose' or the archive name that provides `path`, or None."""
        key = normalize(path)
        if key in self._loose:
            return 'loose'
        for archive in self.archives:
            if key in archive.entries:
                return archive.name
        return None

    def stamp(self, path: str) -> str | None:
        """A cheap mark of the copy of `path` the game reads, without reading it: changes when that copy changes
        (the loose file's or the archive's path, size and time, plus the entry's place in the archive), or None."""
        key = normalize(path)
        loose = self._loose.get(key)
        try:
            if loose:
                st = os.stat(loose)
                return f'{os.path.abspath(loose)}|{st.st_size}|{st.st_mtime_ns}'
            for archive in self.archives:
                found = archive.entries.get(key)
                if found is not None:
                    st = os.stat(archive.path)
                    return f'{os.path.abspath(archive.path)}|{st.st_size}|{st.st_mtime_ns}|{found[0]}|{found[1]}'
        except OSError:
            return None
        return None

    def exists(self, path: str) -> bool:
        return self.where(path) is not None

    def read(self, path: str) -> bytes | None:
        """The file as the game reads it (chunked containers unpacked), or None when no source has it.
        Raises chunk.ChunkError for a damaged container."""
        key = normalize(path)
        loose = self._loose.get(key)
        if loose:
            with open(loose, 'rb') as f:
                data = f.read()
        else:
            data = None
            for archive in self.archives:
                data = archive.read(key)
                if data is not None:
                    break
            if data is None:
                return None
        return chunk.decode(data)

    def list(self, prefix: str) -> list[str]:
        """Every game path that starts with `prefix` (loose and archived, no duplicates)."""
        prefix = normalize(prefix)
        out = {k for k in self._loose if k.startswith(prefix)}
        for archive in self.archives:
            out.update(k for k in archive.entries if k.startswith(prefix))
        return sorted(out)
