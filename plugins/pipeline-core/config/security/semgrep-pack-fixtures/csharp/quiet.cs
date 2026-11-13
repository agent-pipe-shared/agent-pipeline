using System;
using System.Data.SqlClient;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text.Json;
using System.Xml;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Demo
{
    public class CatalogController : ControllerBase
    {
        private readonly SqlConnection _conn;
        private readonly AppDb _db;
        private readonly HttpClient _http;

        public IActionResult Find(string name)
        {
            var cmd = new SqlCommand("SELECT * FROM Orders WHERE Name = @name", _conn);
            cmd.Parameters.AddWithValue("@name", name);
            return Ok(cmd.ExecuteScalar());
        }

        public IActionResult Remove(int id)
        {
            _db.Database.ExecuteSql($"DELETE FROM Orders WHERE Id = {id}");
            return Ok();
        }

        public IActionResult Greeting(string name)
        {
            var text = $"Select your product, {name}";
            return Ok(text);
        }

        public IActionResult Build()
        {
            Process.Start("dotnet", "build --configuration Release");
            Process.Start("cmd.exe", "/c dir");
            return Ok();
        }

        public T Load<T>(Stream body)
        {
            return JsonSerializer.Deserialize<T>(body);
        }

        public XmlReaderSettings Xml()
        {
            return new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null };
        }

        public IActionResult Download(string fileName)
        {
            var bytes = System.IO.File.ReadAllBytes(Path.Combine("/srv/files", Path.GetFileName(fileName)));
            return File(bytes, "application/octet-stream");
        }

        public async System.Threading.Tasks.Task<string> Item(int id)
        {
            return await _http.GetStringAsync($"https://api.internal.example/items/{id}");
        }

        public byte[] Hash(byte[] data)
        {
            return SHA256.HashData(data);
        }
    }
}
