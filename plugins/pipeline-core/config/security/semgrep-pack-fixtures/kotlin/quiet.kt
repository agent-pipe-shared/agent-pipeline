package demo

import java.io.File
import java.io.InputStream
import java.net.URL
import java.security.MessageDigest
import javax.xml.parsers.DocumentBuilderFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class Quiet(private val jdbc: JdbcTemplate) {

    fun findUser(name: String): List<Map<String, Any>> =
        jdbc.queryForList("SELECT * FROM users WHERE name = ?", name)

    fun count(): Int? = jdbc.queryForObject("SELECT count(*) FROM users " + "WHERE active", Int::class.java)

    fun greeting(name: String) = "select a product, $name"

    fun build() {
        ProcessBuilder("sh", "-c", "make build").start()
        ProcessBuilder("git", "status").start()
    }

    fun parse(input: InputStream): Any {
        val f = DocumentBuilderFactory.newInstance()
        f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
        return f.newDocumentBuilder().parse(input)
    }

    @GetMapping("/file")
    fun read(@RequestParam name: String): ByteArray {
        return File("/srv/files", File(name).name).readBytes()
    }

    @GetMapping("/item")
    fun item(@RequestParam id: String): String {
        return URL("https://api.internal.example/items/$id").readText()
    }

    fun sha256(data: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(data)
}
