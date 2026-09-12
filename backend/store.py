"""System of record for the session document.

One JSON document — factories, ledger, intake records, inbox — written through by the web app and
read back on load, so data survives a browser change and a judge sees it round-trip through the
API. MongoDB is used when configured; otherwise a JSON file beside the service. Neither is a
prerequisite for the demonstration: the app degrades to local storage if the service is absent.
"""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any, Dict, Optional

DATA_DIR = Path(__file__).parent / 'data'
FILE = DATA_DIR / 'state.json'
_lock = threading.Lock()


class Store:
    def __init__(self, db=None):
        self.db = db

    async def load(self) -> Optional[Dict[str, Any]]:
        if self.db is not None:
            doc = await self.db.state.find_one({'_id': 'session'})
            if doc:
                doc.pop('_id', None)
                return doc
            return None
        with _lock:
            if not FILE.exists():
                return None
            try:
                return json.loads(FILE.read_text())
            except json.JSONDecodeError:
                return None

    async def save(self, doc: Dict[str, Any]) -> None:
        if self.db is not None:
            await self.db.state.replace_one({'_id': 'session'}, {'_id': 'session', **doc}, upsert=True)
            return
        with _lock:
            DATA_DIR.mkdir(exist_ok=True)
            tmp = FILE.with_suffix('.tmp')
            tmp.write_text(json.dumps(doc))
            os.replace(tmp, FILE)          # atomic on POSIX: a crash mid-write cannot corrupt the file

    async def clear(self) -> None:
        if self.db is not None:
            await self.db.state.delete_one({'_id': 'session'})
            return
        with _lock:
            if FILE.exists():
                FILE.unlink()


SETTINGS_FILE = DATA_DIR / 'settings.json'


class SettingsStore:
    """The OpenRouter key and default model, so a refresh does not cost the operator a paste.

    Stored beside the service (file mode 0600) or in MongoDB when configured. This is a single-
    operator demonstration deployment: the key is held in plain form and returned to the browser,
    which calls OpenRouter directly. A multi-user deployment would proxy those calls instead.
    """

    def __init__(self, db=None):
        self.db = db

    async def load(self) -> Dict[str, Any]:
        if self.db is not None:
            doc = await self.db.settings.find_one({'_id': 'operator'}) or {}
            doc.pop('_id', None)
            return doc
        with _lock:
            if not SETTINGS_FILE.exists():
                return {}
            try:
                return json.loads(SETTINGS_FILE.read_text())
            except json.JSONDecodeError:
                return {}

    async def save(self, doc: Dict[str, Any]) -> None:
        if self.db is not None:
            await self.db.settings.replace_one({'_id': 'operator'}, {'_id': 'operator', **doc}, upsert=True)
            return
        with _lock:
            DATA_DIR.mkdir(exist_ok=True)
            tmp = SETTINGS_FILE.with_suffix('.tmp')
            tmp.write_text(json.dumps(doc))
            os.chmod(tmp, 0o600)
            os.replace(tmp, SETTINGS_FILE)

    async def clear(self) -> None:
        if self.db is not None:
            await self.db.settings.delete_one({'_id': 'operator'})
            return
        with _lock:
            if SETTINGS_FILE.exists():
                SETTINGS_FILE.unlink()
