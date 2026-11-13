package demo;

import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.sql.*;
import javax.crypto.Cipher;
import javax.net.ssl.*;
import javax.servlet.http.HttpServletRequest;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

@RestController
public class Hits {
    Connection conn;
    RestTemplate rest;

    public ResultSet sqlDirect(String name) throws Exception {
        Statement st = conn.createStatement();
        return st.executeQuery("SELECT * FROM users WHERE name = '" + name + "'");
    }

    public ResultSet sqlViaVariable(String id) throws Exception {
        String q = String.format("DELETE FROM orders WHERE id = %s", id);
        return conn.createStatement().executeQuery(q);
    }

    public void shell(String host) throws Exception {
        new ProcessBuilder("sh", "-c", "ping -c 1 " + host).start();
        Runtime.getRuntime().exec("nslookup " + host);
    }

    public Object deserialize(InputStream in) throws Exception {
        ObjectInputStream ois = new ObjectInputStream(in);
        return ois.readObject();
    }

    public HostnameVerifier trustAllHosts() {
        return (h, s) -> true;
    }

    public void allHosts(HttpsURLConnection c) {
        c.setHostnameVerifier((h, s) -> true);
    }

    public Object parse(InputStream in) throws Exception {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        return f.newDocumentBuilder().parse(in);
    }

    @GetMapping("/file")
    public byte[] read(@RequestParam String name) throws Exception {
        return Files.readAllBytes(Paths.get("/srv/files", name));
    }

    @GetMapping("/fetch")
    public String fetch(@RequestParam("url") String target) {
        return rest.getForObject(target, String.class);
    }

    public void servletFile(HttpServletRequest req) throws Exception {
        String p = req.getParameter("path");
        new FileInputStream(p).close();
    }

    public byte[] md5(byte[] data) throws Exception {
        return MessageDigest.getInstance("MD5").digest(data);
    }

    public Cipher ecb() throws Exception {
        return Cipher.getInstance("AES");
    }
}

class TrustAll implements X509TrustManager {
    public void checkClientTrusted(java.security.cert.X509Certificate[] chain, String authType) {}
    public void checkServerTrusted(java.security.cert.X509Certificate[] chain, String authType) {}
    public java.security.cert.X509Certificate[] getAcceptedIssuers() { return null; }
}
