<?php

function findUser($pdo, $name)
{
    $stmt = $pdo->prepare('SELECT * FROM users WHERE name = :name');
    $stmt->execute(['name' => $name]);
    return $stmt->fetchAll();
}

function countUsers($pdo)
{
    return $pdo->query('SELECT count(*) FROM users ' . 'WHERE active');
}

function greeting($name)
{
    return "select a product, $name";
}

function build($dir)
{
    system('make build');
    return shell_exec('ls -l ' . escapeshellarg($dir));
}

function load($blob)
{
    return unserialize($blob, ['allowed_classes' => false]);
}

function client()
{
    $ch = curl_init('https://api.internal.example/');
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    return $ch;
}

function parse($xml)
{
    $doc = new DOMDocument();
    $doc->loadXML($xml);
    return $doc;
}

function readUpload()
{
    return file_get_contents('/srv/files/' . basename($_GET['name']));
}

function item()
{
    $ch = curl_init('https://api.internal.example/items/' . $_GET['id']);
    return curl_exec($ch);
}

function digest($data)
{
    return hash('sha256', $data);
}

function routes()
{
    return ['path' => '/orders', 'verify' => false, 'methods' => ['GET']];
}

function contained()
{
    $base = '/srv/files/';
    $full = realpath($base . $_GET['name']);
    if ($full === false || !str_starts_with($full, $base)) {
        return null;
    }
    return file_get_contents($full);
}
