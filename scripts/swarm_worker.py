#!/usr/bin/env python3
import argparse
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


DEFAULT_TIMEOUT = 120
SWARM_ALLOWED_ASPECT_RATIOS = {
    "1:1",
    "4:3",
    "3:2",
    "8:5",
    "16:9",
    "21:9",
    "3:4",
    "2:3",
    "5:8",
    "9:16",
    "9:21",
}


def log(message):
    print(f"[swarm-worker] {message}", flush=True)


def join_url(base_url, path):
    return urllib.parse.urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))


def build_safe_download_url(base_url, raw_path):
    joined = join_url(base_url, raw_path)
    parsed = urllib.parse.urlsplit(joined)
    safe_path = urllib.parse.quote(parsed.path, safe="/%")
    safe_query = urllib.parse.quote_plus(parsed.query, safe="=&%")
    return urllib.parse.urlunsplit(
        (parsed.scheme, parsed.netloc, safe_path, safe_query, parsed.fragment)
    )


def greatest_common_divisor(a, b):
    x = abs(int(a))
    y = abs(int(b))
    while y != 0:
        x, y = y, x % y
    return x or 1


def resolve_swarm_aspect_ratio(width, height):
    if width <= 0 or height <= 0:
        return "2:3"

    divisor = greatest_common_divisor(width, height)
    ratio = f"{width // divisor}:{height // divisor}"
    return ratio if ratio in SWARM_ALLOWED_ASPECT_RATIOS else "Custom"


def request_json(url, method="GET", headers=None, payload=None, timeout=DEFAULT_TIMEOUT):
    body = None
    request_headers = dict(headers or {})
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")

    request = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        raw = response.read().decode(charset)
        return json.loads(raw) if raw else {}


def request_json_with_status(url, method="GET", headers=None, payload=None, timeout=DEFAULT_TIMEOUT):
    try:
        return request_json(url, method=method, headers=headers, payload=payload, timeout=timeout)
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body) if body else {}
        except json.JSONDecodeError:
            parsed = {"error": body or f"HTTP {error.code}"}
        raise RuntimeError(parsed.get("error") or f"HTTP {error.code}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(str(error.reason)) from error


def build_multipart_form(file_name, content_type, file_bytes):
    boundary = f"----EroChatWorker{uuid.uuid4().hex}"
    lines = [
        f"--{boundary}",
        f'Content-Disposition: form-data; name="file"; filename="{file_name}"',
        f"Content-Type: {content_type}",
        "",
    ]
    body = "\r\n".join(lines).encode("utf-8") + b"\r\n" + file_bytes + b"\r\n"
    body += f"--{boundary}--\r\n".encode("utf-8")
    return boundary, body


class SwarmWorker:
    def __init__(self, app_url, worker_token, swarm_url, poll_interval, worker_name):
        self.app_url = app_url.rstrip("/")
        self.worker_token = worker_token.strip()
        self.swarm_url = swarm_url.rstrip("/")
        self.poll_interval = poll_interval
        self.worker_name = worker_name
        self.session_id = None

    @property
    def auth_headers(self):
        return {
            "Authorization": f"Bearer {self.worker_token}"
        }

    def get_swarm_session(self):
        payload = request_json_with_status(
            join_url(self.swarm_url, "/API/GetNewSession"),
            method="POST",
            payload={},
        )
        session_id = payload.get("session_id")
        if not session_id:
            raise RuntimeError("SwarmUI did not return a session_id.")
        self.session_id = session_id
        return session_id

    def build_swarm_payload(self, job):
        request_json_payload = job.get("requestJson") or {}
        prompt = str(job.get("prompt") or "").strip()
        if not prompt:
            raise RuntimeError("Generator job is missing a prompt.")

        model = str(request_json_payload.get("model") or "").strip()
        if not model:
            raise RuntimeError("Swarm job is missing a selected model.")

        if not self.session_id:
            self.get_swarm_session()

        batch_count = int(request_json_payload.get("batchCount") or 1)
        width = int(request_json_payload.get("width") or 832)
        height = int(request_json_payload.get("height") or 1216)
        steps = int(request_json_payload.get("steps") or 25)
        cfg_scale = float(request_json_payload.get("cfgScale") or 7)
        sampler = str(request_json_payload.get("sampler") or "euler_ancestral")
        seed_mode = str(request_json_payload.get("seedMode") or "random")
        base_seed = int(request_json_payload.get("baseSeed") or 1)

        return {
            "session_id": self.session_id,
            "images": max(1, min(4, batch_count)),
            "batchsize": str(max(1, min(4, batch_count))),
            "prompt": prompt,
            "negativeprompt": str(job.get("negativePrompt") or " (bad quality:1.15), (worst quality:1.3)"),
            "model": model,
            "width": width,
            "height": height,
            "steps": steps,
            "cfgscale": cfg_scale,
            "sampler_name": sampler,
            "scheduler": "karras",
            "seed": -1 if seed_mode == "random" else base_seed,
            "aspectratio": resolve_swarm_aspect_ratio(width, height),
            "automaticvae": True,
            "clipstopatlayer": "-2",
            "colorcorrectionbehavior": "None",
            "colordepth": "8bit",
        }

    def claim_job(self):
        payload = request_json_with_status(
            join_url(self.app_url, "/api/generator/worker/jobs/claim"),
            method="POST",
            headers=self.auth_headers,
            payload={"workerName": self.worker_name},
        )
        return payload.get("job")

    def update_job(self, job_id, patch):
        request_json_with_status(
            join_url(self.app_url, f"/api/generator/worker/jobs/{job_id}"),
            method="PATCH",
            headers=self.auth_headers,
            payload=patch,
        )

    def run_swarm_job(self, job):
        payload = self.build_swarm_payload(job)
        try:
            data = request_json_with_status(
                join_url(self.swarm_url, "/API/GenerateText2Image"),
                method="POST",
                payload=payload,
            )
        except RuntimeError:
            self.get_swarm_session()
            payload["session_id"] = self.session_id
            data = request_json_with_status(
                join_url(self.swarm_url, "/API/GenerateText2Image"),
                method="POST",
                payload=payload,
            )

        images = data.get("images") if isinstance(data.get("images"), list) else []
        if not images:
            raise RuntimeError("SwarmUI returned no images.")
        return images

    def download_image(self, image_path):
        url = build_safe_download_url(self.swarm_url, image_path)
        with urllib.request.urlopen(url, timeout=DEFAULT_TIMEOUT) as response:
            content_type = response.headers.get_content_type() or "application/octet-stream"
            return content_type, response.read()

    def upload_media(self, file_name, content_type, file_bytes):
        boundary, body = build_multipart_form(file_name, content_type, file_bytes)
        headers = {
            **self.auth_headers,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
        }
        request = urllib.request.Request(
            join_url(self.app_url, "/api/media/upload"),
            data=body,
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=DEFAULT_TIMEOUT) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                return json.loads(response.read().decode(charset))
        except urllib.error.HTTPError as error:
            body_text = error.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(body_text) if body_text else {}
            except json.JSONDecodeError:
                payload = {"error": body_text or f"HTTP {error.code}"}
            raise RuntimeError(payload.get("error") or f"HTTP {error.code}") from error

    def complete_job(self, job, image_paths):
        request_json_payload = job.get("requestJson") or {}
        assets = []

        for index, image_path in enumerate(image_paths):
            content_type, file_bytes = self.download_image(image_path)
            extension = mimetypes.guess_extension(content_type) or ".png"
            uploaded = self.upload_media(f"swarm-job-{job['id']}-{index}{extension}", content_type, file_bytes)
            assets.append(
                {
                    "mediaType": "image",
                    "url": uploaded["url"],
                    "width": int(request_json_payload.get("width") or 0) or None,
                    "height": int(request_json_payload.get("height") or 0) or None,
                    "metadata": {
                        "worker": self.worker_name,
                        "sourcePath": image_path,
                    },
                }
            )

        self.update_job(
            job["id"],
            {
                "status": "succeeded",
                "errorMessage": None,
                "assets": assets,
            },
        )

    def fail_job(self, job_id, message):
        self.update_job(
            job_id,
            {
                "status": "failed",
                "errorMessage": message[:1000],
            },
        )

    def process_once(self):
        job = self.claim_job()
        if not job:
            return False

        log(f"Claimed job #{job['id']} for prompt: {job.get('prompt', '')[:80]}")
        try:
            image_paths = self.run_swarm_job(job)
            self.complete_job(job, image_paths)
            log(f"Completed job #{job['id']} with {len(image_paths)} image(s).")
        except Exception as error:  # noqa: BLE001
            log(f"Job #{job['id']} failed: {error}")
            try:
                self.fail_job(job["id"], str(error))
            except Exception as update_error:  # noqa: BLE001
                log(f"Failed to report error for job #{job['id']}: {update_error}")
        return True

    def run_forever(self):
        log(
            f"Starting worker '{self.worker_name}' against {self.app_url} using local SwarmUI at {self.swarm_url}"
        )
        while True:
            try:
                handled_job = self.process_once()
            except Exception as error:  # noqa: BLE001
                log(f"Worker loop error: {error}")
                handled_job = False

            if not handled_job:
                time.sleep(self.poll_interval)


def parse_args():
    parser = argparse.ArgumentParser(description="EroChat SwarmUI remote worker")
    parser.add_argument("--app-url", default=os.environ.get("EROCHAT_APP_URL", "http://localhost:20121"))
    parser.add_argument("--worker-token", default=os.environ.get("EROCHAT_WORKER_TOKEN", ""))
    parser.add_argument("--swarm-url", default=os.environ.get("SWARMUI_URL", "http://127.0.0.1:7801"))
    parser.add_argument("--poll-interval", type=float, default=float(os.environ.get("EROCHAT_POLL_INTERVAL", "3")))
    parser.add_argument("--worker-name", default=os.environ.get("EROCHAT_WORKER_NAME", "swarm-local"))
    return parser.parse_args()


def main():
    args = parse_args()
    if not args.worker_token.strip():
        log("Missing worker token. Set --worker-token or EROCHAT_WORKER_TOKEN.")
        return 1

    worker = SwarmWorker(
        app_url=args.app_url,
        worker_token=args.worker_token,
        swarm_url=args.swarm_url,
        poll_interval=max(0.5, args.poll_interval),
        worker_name=args.worker_name.strip() or "swarm-local",
    )

    try:
        worker.run_forever()
    except KeyboardInterrupt:
        log("Stopping worker.")
        return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
