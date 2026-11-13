using System;
using System.Data.SqlClient;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Runtime.Serialization.Formatters.Binary;
using System.Security.Cryptography;
using System.Xml;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;

namespace Demo
{
    public class OrdersController : ControllerBase
    {
        private readonly SqlConnection _conn;
        private readonly AppDb _db;
        private readonly HttpClient _http;

        public IActionResult Find(string name)
        {
            var cmd = new SqlCommand($"SELECT * FROM Orders WHERE Name = '{name}'", _conn);
            return Ok(cmd.ExecuteScalar());
        }

        public IActionResult Remove(string id)
        {
            var sql = "DELETE FROM Orders WHERE Id = " + id;
            _db.Database.ExecuteSqlRaw(sql);
            return Ok();
        }

        public IActionResult Ping(string host)
        {
            Process.Start("cmd.exe", "/c ping " + host);
            return Ok();
        }

        public object Load(Stream body)
        {
            var formatter = new BinaryFormatter();
            return formatter.Deserialize(body);
        }

        public JsonSerializerSettings Settings()
        {
            return new JsonSerializerSettings { TypeNameHandling = TypeNameHandling.All };
        }

        public HttpClientHandler Handler()
        {
            var handler = new HttpClientHandler();
            handler.ServerCertificateCustomValidationCallback = (msg, cert, chain, errors) => true;
            return handler;
        }

        public XmlReaderSettings Xml()
        {
            var settings = new XmlReaderSettings();
            settings.DtdProcessing = DtdProcessing.Parse;
            return settings;
        }

        public IActionResult Download(string fileName)
        {
            var bytes = System.IO.File.ReadAllBytes(Path.Combine("/srv/files", fileName));
            return File(bytes, "application/octet-stream");
        }

        public async System.Threading.Tasks.Task<string> Proxy(string url)
        {
            return await _http.GetStringAsync(url);
        }

        public byte[] Hash(byte[] data)
        {
            using var md5 = MD5.Create();
            return md5.ComputeHash(data);
        }
    }
}
