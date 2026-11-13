import hashlib
import json
import os
import subprocess

import requests
import yaml
from flask import Flask, request, send_file
from lxml import etree
from werkzeug.utils import secure_filename

app = Flask(__name__)


def find_user(cursor, name):
    cursor.execute("SELECT * FROM users WHERE name = %s", (name,))


def count(cursor):
    cursor.execute("SELECT count(*) FROM users " + "WHERE active")


def greeting(name):
    return f"select a product, {name}"


def build():
    subprocess.run(["git", "status"])
    subprocess.run("make build", shell=True)
    os.system("uptime")


def load(blob):
    return json.loads(blob)


def load_config(stream):
    return yaml.safe_load(stream)


def fetch(url):
    return requests.get(url, timeout=5)


def parse(data):
    parser = etree.XMLParser(resolve_entities=False, no_network=True)
    return etree.fromstring(data, parser)


@app.route("/file")
def read_file():
    name = secure_filename(request.args.get("name"))
    return open(os.path.join("/srv/files", name)).read()


@app.route("/item")
def item():
    item_id = request.args.get("id")
    return requests.get(f"https://api.internal.example/items/{item_id}").text


def checksum(data):
    return hashlib.md5(data, usedforsecurity=False).hexdigest()


def strong(data):
    return hashlib.sha256(data).hexdigest()


BASE = "/srv/files"


@app.route("/contained")
def contained():
    full = os.path.realpath(os.path.join(BASE, request.args.get("name")))
    if not full.startswith(BASE + os.sep):
        return "", 400
    return open(full).read()
