import hashlib
import os
import pickle
import ssl
import subprocess

import requests
import yaml
from flask import Flask, request, send_file
from lxml import etree
from sqlalchemy import text

app = Flask(__name__)


def find_user(cursor, name):
    cursor.execute(f"SELECT * FROM users WHERE name = '{name}'")


def delete_order(cursor, order_id):
    q = "DELETE FROM orders WHERE id = %s" % order_id
    cursor.execute(q)


def report(session, region):
    return session.execute(text("SELECT * FROM sales WHERE region = '" + region + "'"))


def ping(host):
    subprocess.run(f"ping -c 1 {host}", shell=True)
    os.system("nslookup " + host)


def load(blob):
    return pickle.loads(blob)


def load_config(stream):
    return yaml.load(stream, Loader=yaml.Loader)


def fetch_insecure(url):
    return requests.get(url, verify=False)


def context():
    return ssl._create_unverified_context()


def parse(data):
    parser = etree.XMLParser(resolve_entities=True)
    return etree.fromstring(data, parser)


@app.route("/file")
def read_file():
    name = request.args.get("name")
    return open(os.path.join("/srv/files", name)).read()


@app.route("/download")
def download():
    return send_file(request.args["path"])


@app.route("/proxy")
def proxy():
    target = request.args.get("url")
    return requests.get(target).text


def digest(data):
    return hashlib.md5(data).hexdigest()
