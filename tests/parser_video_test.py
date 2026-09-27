"""Проверка ограничений сборщика видео без запуска браузера и FFmpeg."""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from parser_video import MessageVideos, MAX_VIDEO_BYTES


class FakePage:
    def __init__(self):
        self.handlers = {}

    def on(self, event, callback):
        self.handlers[event] = callback

    def evaluate(self, script, messages):
        return [{"urls": ["https://max.example/video.mp4"]} for _ in messages]


class VideoTests(unittest.TestCase):
    def test_disabled_does_not_capture(self):
        with patch.dict(os.environ, {"PARSER_CAPTURE_VIDEOS": "0"}):
            page = FakePage()
            collector = MessageVideos(page)
            messages = [{"text": "Новость"}]
            collector.enrich(messages)
            self.assertNotIn("requestfinished", page.handlers)
            self.assertNotIn("videos", messages[0])

    def test_capture_stages_small_mp4_and_rejects_large_result(self):
        with tempfile.TemporaryDirectory(prefix="smart-leads-video-") as root:
            with patch.dict(os.environ, {"PARSER_CAPTURE_VIDEOS": "1", "LEAD_MEDIA_DIR": root}):
                collector = MessageVideos(FakePage())
                collector.responses["https://max.example/video.mp4"] = type("Response", (), {"body": lambda self: b"source"})()
                def transcode(arguments, **kwargs):
                    Path(arguments[-1]).write_bytes(b"\0\0\0\x10ftypisom\0\0\0\0")
                with patch("parser_video.subprocess.run", side_effect=transcode):
                    message = {"text": "Новость"}
                    collector.enrich([message])
                self.assertEqual(message["videoReport"]["saved"], 1)
                self.assertEqual((Path(root) / "staging" / message["videos"][0]["key"]).stat().st_size, 16)
                self.assertEqual(len(list((Path(root) / "staging").iterdir())), 1)

                def too_large(arguments, **kwargs):
                    with Path(arguments[-1]).open("wb") as output:
                        output.truncate(MAX_VIDEO_BYTES + 1)
                with patch("parser_video.subprocess.run", side_effect=too_large):
                    rejected = {"text": "Вторая новость"}
                    collector.enrich([rejected])
                self.assertNotIn("videos", rejected)
                self.assertEqual(rejected["videoReport"]["errors"], 1)
                self.assertEqual(len(list((Path(root) / "staging").iterdir())), 1)


if __name__ == "__main__":
    unittest.main()
