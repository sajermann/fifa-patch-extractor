"""How much of the machine an export may use (the Studios' build settings: cores and percent of the memory).

The export reads, unpacks and decodes the items and compresses the zip in threads (zlib and the image codecs let the
other threads run meanwhile). How many: the user's limits (settings), and always the defensive answer when the machine
does not tell:
  - cores the process may use (os.process_cpu_count / affinity / os.cpu_count); unknown -> 1;
  - total memory (Windows GlobalMemoryStatusEx, POSIX sysconf); unknown -> 1 thread;
  - default cores: all but one (so the PC stays usable); default memory: 50%; never less than 1 thread.
"""
import ctypes
import os
import sys

DEFAULT_MEMORY_PERCENT = 50
MEMORY_PERCENT_RANGE = (10, 90)  # the user's setting; never all the memory (the system and the app need some)
WORKER_MEMORY_MB = 150  # budget per thread (the files read ahead and the zip entries compressed ahead)


def cpu_cores():
    """Cores this process may use, or None when the system does not tell."""
    for probe in (getattr(os, 'process_cpu_count', None),
                  lambda: len(os.sched_getaffinity(0)) if hasattr(os, 'sched_getaffinity') else None,
                  os.cpu_count):
        try:
            n = probe() if probe else None
        except (OSError, ValueError, NotImplementedError):
            n = None
        if isinstance(n, int) and n >= 1:
            return n
    return None


def total_memory():
    """Physical memory of the machine in bytes, or None when the system does not tell."""
    try:
        if sys.platform == 'win32':
            class MemoryStatus(ctypes.Structure):
                _fields_ = [('length', ctypes.c_ulong), ('load', ctypes.c_ulong), ('total', ctypes.c_ulonglong),
                            ('available', ctypes.c_ulonglong), ('total_page', ctypes.c_ulonglong),
                            ('available_page', ctypes.c_ulonglong), ('total_virtual', ctypes.c_ulonglong),
                            ('available_virtual', ctypes.c_ulonglong), ('available_extended', ctypes.c_ulonglong)]
            status = MemoryStatus()
            status.length = ctypes.sizeof(MemoryStatus)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)) and status.total > 0:
                return int(status.total)
            return None
        pages, size = os.sysconf('SC_PHYS_PAGES'), os.sysconf('SC_PAGE_SIZE')
        return pages * size if pages > 0 and size > 0 else None
    except (AttributeError, OSError, ValueError):
        return None


def default_cores(cores=None):
    """All cores but one (1 when unknown or when there is only one)."""
    cores = cpu_cores() if cores is None else cores
    return max(1, (cores or 1) - 1)


def plan(cores=None, memory_percent=None, machine_cores=None, machine_memory=None):
    """Number of threads for the export. cores / memory_percent: the user's settings (None = defaults);
    machine_cores / machine_memory: for tests (None = read from the system). Always at least 1."""
    available = cpu_cores() if machine_cores is None else machine_cores
    if not available:
        return 1
    wanted = default_cores(available) if cores is None else max(1, min(int(cores), available))
    memory = total_memory() if machine_memory is None else machine_memory
    if not memory:
        return 1
    percent = DEFAULT_MEMORY_PERCENT if memory_percent is None else clamp_memory_percent(memory_percent)
    fits = int(memory * percent / 100 // (WORKER_MEMORY_MB * 2 ** 20))
    return max(1, min(wanted, fits))


def clamp_cores(cores, machine_cores=None):
    """The user's cores setting kept between 1 and the machine's cores (None stays None = the default)."""
    if cores is None:
        return None
    available = cpu_cores() if machine_cores is None else machine_cores
    return max(1, min(int(cores), available or 1))


def clamp_memory_percent(percent):
    """The user's memory setting kept in MEMORY_PERCENT_RANGE (None stays None = the default)."""
    if percent is None:
        return None
    return max(MEMORY_PERCENT_RANGE[0], min(int(percent), MEMORY_PERCENT_RANGE[1]))


def describe(cores=None, memory_percent=None):
    """Facts for the settings screen and the log."""
    machine_cores, memory = cpu_cores(), total_memory()
    return {'cores': machine_cores, 'memory_mb': memory // 2 ** 20 if memory else None,
            'default_cores': default_cores(machine_cores) if machine_cores else 1,
            'default_memory_percent': DEFAULT_MEMORY_PERCENT, 'memory_percent_range': list(MEMORY_PERCENT_RANGE),
            'worker_memory_mb': WORKER_MEMORY_MB,
            'workers': plan(cores, memory_percent)}
