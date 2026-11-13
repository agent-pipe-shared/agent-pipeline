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

    private val base = File("/srv/files").canonicalFile

    @GetMapping("/contained")
    fun contained(@RequestParam name: String): ByteArray {
        val f = File(base, name).canonicalFile
        if (!f.startsWith(base)) {
            throw SecurityException("outside the base directory")
        }
        return f.readBytes()
    }

    @GetMapping("/order/{id}")
    fun order(@PathVariable id: String, repo: Map<String, String>, resolver: Resolver): String? {
        val name = resolver.resolve(id)
        return repo.get(id) + name
    }

    @GetMapping("/invoice/{id}")
    fun invoice(@PathVariable id: Long): ByteArray {
        return File(base, "$id.pdf").readBytes()
    }
}

interface Resolver {
    fun resolve(key: String): String
}
