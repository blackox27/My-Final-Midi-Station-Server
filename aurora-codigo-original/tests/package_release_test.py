"""Regression checks for interrupted ZIP creation and atomic publication."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile

spec = importlib.util.spec_from_file_location("package_release", Path(__file__).resolve().parents[1] / "scripts/package-release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class PackagingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "source.html"
        self.source.write_text("<!doctype html><title>Aurora</title>")
        self.entries = [(self.source, "index.html")]
        self.output = self.root / "aurora.zip"
        patch = mock.patch.object(release, "release_entries", return_value=self.entries)
        patch.start()
        self.addCleanup(patch.stop)

    def test_final_name_appears_only_after_complete_validation(self):
        check = release.validate_archive
        def validate(path, entries):
            self.assertFalse(self.output.exists())
            check(path, entries)
        with mock.patch.object(release, "validate_archive", side_effect=validate):
            release.package_release(self.root, self.output)
        with zipfile.ZipFile(self.output) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(archive.read("index.html"), self.source.read_bytes())

    def test_interrupted_write_preserves_previous_release(self):
        self.output.write_bytes(b"previous verified release")
        with mock.patch.object(release.zipfile.ZipFile, "write", side_effect=OSError("simulated disk failure")):
            with self.assertRaises(OSError):
                release.package_release(self.root, self.output)
        self.assertEqual(self.output.read_bytes(), b"previous verified release")
        self.assertEqual(list(self.root.glob(".aurora-building-*")), [])

    def test_failed_validation_never_publishes_output(self):
        with mock.patch.object(release, "validate_archive", side_effect=ValueError("CRC failure")):
            with self.assertRaises(ValueError):
                release.package_release(self.root, self.output)
        self.assertFalse(self.output.exists())
        self.assertEqual(list(self.root.glob(".aurora-building-*")), [])

    def test_truncation_is_detected(self):
        release.package_release(self.root, self.output)
        self.output.write_bytes(self.output.read_bytes()[:-22])
        with self.assertRaises(zipfile.BadZipFile):
            release.validate_archive(self.output, self.entries)

    def test_wrong_extension_cannot_overwrite_source(self):
        before = self.source.read_bytes()
        with self.assertRaises(ValueError):
            release.package_release(self.root, self.source)
        self.assertEqual(self.source.read_bytes(), before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
