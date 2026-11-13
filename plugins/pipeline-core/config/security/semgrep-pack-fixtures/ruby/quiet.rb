require "digest"
require "json"
require "net/http"
require "nokogiri"
require "openssl"

class CatalogController < ApplicationController
  def search
    @users = User.where("name = ?", params[:name])
  end

  def count
    ActiveRecord::Base.connection.execute("SELECT count(*) FROM users WHERE active")
  end

  def greeting
    render plain: "select a product, #{params[:name]}"
  end

  def build
    system("make", "build")
    output = `uptime`
    render plain: output
  end

  def restore
    JSON.parse(request.body.read)
  end

  def client
    http = Net::HTTP.new("api.internal.example", 443)
    http.verify_mode = OpenSSL::SSL::VERIFY_PEER
    http
  end

  def parse
    Nokogiri::XML(request.body.read)
  end

  def download
    send_file Rails.root.join("public", "files", File.basename(params[:path]))
  end

  def item
    render plain: Net::HTTP.get(URI("https://api.internal.example/items/#{params[:id]}"))
  end

  def digest
    Digest::SHA256.hexdigest(params[:data])
  end
end
