package demo;

import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.sql.*;
import javax.crypto.Cipher;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.apache.commons.io.FilenameUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

@RestController
public class Quiet {
    Connection conn;
    RestTemplate rest;
    static final String TABLE_QUERY = "SELECT id FROM users";

    public ResultSet sqlBound(String name) throws Exception {
        PreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE name = ?");
        ps.setString(1, name);
        return ps.executeQuery();
    }

    public ResultSet sqlConstant() throws Exception {
        return conn.createStatement().executeQuery("SELECT id FROM users " + "ORDER BY id");
    }

    public void logMessage(String name) {
        System.out.println("select a user: " + name);
    }

    public void shellConstant() throws Exception {
        new ProcessBuilder("sh", "-c", "ls -l /srv").start();
        new ProcessBuilder("git", "status").start();
    }

    public Object parseSafe(InputStream in) throws Exception {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        return f.newDocumentBuilder().parse(in);
    }

    @GetMapping("/file")
    public byte[] read(@RequestParam String name) throws Exception {
        return Files.readAllBytes(Paths.get("/srv/files", FilenameUtils.getName(name)));
    }

    @GetMapping("/fetch")
    public String fetch(@RequestParam("id") String id) {
        return rest.getForObject("https://api.internal.example/items/{id}", String.class, id);
    }

    public byte[] sha256(byte[] data) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(data);
    }

    public Cipher gcm() throws Exception {
        return Cipher.getInstance("AES/GCM/NoPadding");
    }
}
