from tempfile import TemporaryDirectory
from .fixture import fixture


def set_up(self):
    self.directory = TemporaryDirectory(prefix="tsn-local-node-test-")
    self.node = fixture(self.directory.name)
