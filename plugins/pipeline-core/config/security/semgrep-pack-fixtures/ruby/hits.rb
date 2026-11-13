require "digest"
require "net/http"
require "nokogiri"
require "open3"
require "openssl"

class OrdersController < ApplicationController
  def search
    @users = User.where("name = '#{params[:name]}'")
  end

  def purge
    sql = "DELETE FROM orders WHERE id = #{params[:id]}"
    ActiveRecord::Base.connection.execute(sql)
  end

  def ping
    host = params[:host]
    output = `ping -c 1 #{host}`
    system("nslookup " + host)
    render plain: output
  end

  def restore
    Marshal.load(request.body.read)
  end

  def client
    http = Net::HTTP.new("api.internal.example", 443)
    http.verify_mode = OpenSSL::SSL::VERIFY_NONE
    http
  end

  def parse
    Nokogiri::XML(request.body.read) { |config| config.noent }
  end

  def download
    send_file params[:path]
  end

  def proxy
    render plain: Net::HTTP.get(URI(params[:url]))
  end

  def digest
    Digest::MD5.hexdigest(params[:data])
  end
end
