<?php

function findUser($pdo, $name)
{
    return $pdo->query("SELECT * FROM users WHERE name = '$name'");
}

function deleteOrder($conn, $id)
{
    $sql = 'DELETE FROM orders WHERE id = ' . $id;
    return mysqli_query($conn, $sql);
}

function ping($host)
{
    return shell_exec("ping -c 1 " . $host);
}

function load($blob)
{
    return unserialize($blob);
}

function client()
{
    $ch = curl_init('https://api.internal.example/');
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    return $ch;
}

function parse($xml)
{
    $doc = new DOMDocument();
    $doc->loadXML($xml, LIBXML_NOENT);
    return $doc;
}

function readUpload()
{
    return file_get_contents('/srv/files/' . $_GET['name']);
}

function proxy()
{
    $ch = curl_init($_GET['url']);
    return curl_exec($ch);
}

function digest($data)
{
    return hash('md5', $data);
}
