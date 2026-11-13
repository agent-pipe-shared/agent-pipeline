package demo

import java.io.File
import java.io.InputStream
import java.io.ObjectInputStream
import java.net.URL
import java.security.MessageDigest
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.X509TrustManager
import javax.xml.parsers.DocumentBuilderFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class Hits(private val jdbc: JdbcTemplate) {

    fun findUser(name: String): List<Map<String, Any>> =
        jdbc.queryForList("SELECT * FROM users WHERE name = '$name'")

    fun deleteOrder(id: String) {
        val q = "DELETE FROM orders WHERE id = " + id
        jdbc.update(q)
    }

    fun ping(host: String) {
        ProcessBuilder("sh", "-c", "ping -c 1 $host").start()
    }

    fun load(input: InputStream): Any? {
        val ois = ObjectInputStream(input)
        return ois.readObject()
    }

    val allHosts = HostnameVerifier { _, _ -> true }

    fun parse(input: InputStream): Any {
        val f = DocumentBuilderFactory.newInstance()
        return f.newDocumentBuilder().parse(input)
    }

    @GetMapping("/file")
    fun read(@RequestParam name: String): ByteArray {
        return File("/srv/files", name).readBytes()
    }

    @GetMapping("/fetch")
    fun fetch(@RequestParam("url") target: String): String {
        return URL(target).readText()
    }

    fun md5(data: ByteArray): ByteArray = MessageDigest.getInstance("MD5").digest(data)
}

class TrustAll : X509TrustManager {
    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
    override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
}
