"""Read-only BIG4/BIGF archives: a header with the file count, then one `offset, size (u32 BE), name\\0` per file."""
import os
import struct

MAGICS = (b'BIG4', b'BIGF')


class BigError(ValueError):
    """Not an archive this reader knows."""


class BigArchive:
    """Index of one archive; entries are read on demand (names normalized: lower case, '/' separators)."""

    def __init__(self, path: str):
        self.path = path
        self.name = os.path.basename(path)
        self.entries: dict[str, tuple[int, int]] = {}
        with open(path, 'rb') as f:
            head = f.read(16)
            if len(head) < 16 or head[:4] not in MAGICS:
                raise BigError(f'{self.name}: not a BIG archive')
            count, header_size = struct.unpack('>II', head[8:16])
            data = f.read(max(0, header_size - 16) + 512)
        p = 0
        try:
            for _ in range(count):
                offset, size = struct.unpack('>II', data[p:p + 8])
                end = data.index(b'\0', p + 8)
                name = data[p + 8:end].decode('latin1')
                p = end + 1
                self.entries[normalize(name)] = (offset, size)
        except (struct.error, ValueError) as e:
            raise BigError(f'{self.name}: damaged index ({e})') from e

    def read(self, name: str) -> bytes | None:
        """Raw bytes of an entry (still packed when the archive keeps it packed), or None."""
        found = self.entries.get(normalize(name))
        if found is None:
            return None
        offset, size = found
        with open(self.path, 'rb') as f:
            f.seek(offset)
            return f.read(size)


def normalize(path: str) -> str:
    return path.replace('\\', '/').lstrip('/').lower()
