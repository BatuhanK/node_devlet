'use strict';
var request = require('request');
var async = require('async');
var Q = require('q');


function tokenExtractor (body){
    var token_regex = /<input type="hidden" name="currentPageToken" value="(.*)"/g;
    var get_token = token_regex.exec(body);
    if(get_token){
        return get_token[1];
    } else {
        return null;
    }
}


class NodeDevlet {
    constructor(tcNumber,password){
        this.tcNumber = tcNumber;
        this.password = password;
        this._token = null;
        this._jar = request.jar();
        this._loginCompleted = 0;
        this.userData = null;
    }

    _initSession(callback){
        var self = this;
        request({
            uri: "https://giris.turkiye.gov.tr/Giris/Mobil/V2/e-Devlet-Sifresi",
            jar: this._jar
        },function(error,response,body){
            var token = tokenExtractor(body);
            if(response.statusCode != 200 || !token){
                return callback(new Error('E-devlet token alınamadı'));
            } else {
                self._token = token;
                return callback(null,token);
            }
        });
    }
    _startLogin(callback){
        var self = this;
        var login_post_data = {
            tridField: this.tcNumber,
            encTridField: '',
            egpField: this.password,
            encEgpField: '',
            submitButton: 'Sisteme Giriş Yap',
            currentPageToken: this._token,
            actionName: 'mobilGiris'
        };
        request({
            uri: 'https://giris.turkiye.gov.tr/Giris/Mobil/V2/e-Devlet-Sifresi',
            method: 'POST',
            form: login_post_data,
            json: false,
            jar: self._jar
        }, function(error,response,body){
            callback();
        })
    }
    _getUserData (callback){
        var self = this;
        request({
            uri: 'https://m.turkiye.gov.tr/api.php?p=kisisel-bilgiler',
            method: 'GET',
            jar: self._jar
        }, function(error,response,body){
            if(error){
                return callback(new Error('Bilinmeyen bir hata oluştu'));
            } else {
                self.userData = JSON.parse(body);
                if(self.userData.login){
                    return callback();
                } else {
                    return callback(new Error('Hatalı tckimlik veya şifre'));
                }

            }
        })
    }
    _plakaSorgula(plakaString,callback){
        var self = this;
        request({
            uri: 'https://m.turkiye.gov.tr/api.php?p=arac-sorgulama&plakaNo=' + plakaString,
            method: 'GET',
            jar: self._jar
        }, function(error,response,body){
            if(error){
                return callback(new Error('Plaka sorgulama hatası - HTTP request gönderilemedi'));
            }
            try{
                var jsonBody = JSON.parse(body);
                if(jsonBody.data.status === "MAIN_KUYRUKTA_BEKLIYOR"){
                    return callback(new Error('Kuyruğa takıldınız, tekrar deneyin'));
                }
                if(!jsonBody.data.methodOutputJson){
                    return callback(new Error('Hatalı plaka'));
                }

                return callback(null,JSON.parse(jsonBody.data.methodOutputJson));

            } catch(err){
                return callback(new Error('Plaka sorgulama hatası - JSON encode edilemedi'));
            }
        })
    }
    login(){
        var self = this;
        var deferred = Q.defer();
        async.series([
            function(cb){
                self._initSession(cb);
            },
            function(cb){
                self._startLogin(cb);
            },
            function(cb){
                self._getUserData(cb);
            }
        ], function(err,data){
            if(err){
                self._loginCompleted = 2;
                deferred.reject(err);
            } else {
                self._loginCompleted = 1;
                deferred.resolve();
            }
        });

        return deferred.promise;
    }
    plakaSorgula(plakaString,callback){
        var self = this;
        var returnData = "";
        var returnError;
        var count = 0;
        async.doWhilst(function(cb){
            self._plakaSorgula(plakaString,function(err,data){
                count++;
                if(data){
                    data.sorguSayisi = count;
                    returnData = data;
                }
                if(count>10){
                    returnData = {};
                    returnError = new Error('10 sorgudan fazla yapıldı fakat kuyruk aşılamadı');
                }

                cb();
            })
        }, function(){
            if(returnData !== "")
                return false;
            else
                return true;
        }, function(){
            callback(returnError,returnData);
        })
    }


}

module.exports = NodeDevlet;