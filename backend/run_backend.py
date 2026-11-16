"""Entry point of the packaged backend (PyInstaller, desktop app): same as python -m fpxapi."""
import multiprocessing

from fpxapi.__main__ import main

if __name__ == '__main__':
    multiprocessing.freeze_support()
    main()
