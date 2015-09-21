var NodeDevlet = require('./index');

var testInstance = new NodeDevlet('TCKIMLIK','EDEVLET-SIFRE');
testInstance.login()
    .then(function(){
        testInstance.plakaSorgula('34AGA39',function(err,data){
            console.log(err ? err : data);
        })
    })