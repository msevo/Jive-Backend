const AWS = require('aws-sdk');
var sanitize = require("sanitize-filename");

AWS.config.update({
  accessKeyId: "",
  secretAccessKey: ""
});

var s3 = new AWS.S3({region: 'us-west-1'});
var photosBucket = '';

exports.uploadImage = (req, res, next) => {
  //configuring parameters
  //let newFileName = sanitize(req.body.filename).replace(/\s+/g, '');
  let newFileName = req.body.filename;
  newFileName = newFileName.split('.');
  newFileName.splice(newFileName.length - 1, 0, new Date() * 1);
  newFileName = newFileName.join('.');
  /*if (newFileName.length > 1024) {
    //limit filename length to 1024 for Amazon S3
    newFileName = newFileName.substring(newFileName.length - 1024, 1024);
  }*/
  const key = req.body.imgType + '/' + newFileName;
  const path = photosBucket + '/' + key;

  var params = {
    Bucket: photosBucket,
    Key : key,
    Expires: 60,
    ContentType: 'undefined'
  };

  s3.getSignedUrl('putObject', params, function (err, signedUrl) {
    // send signedUrl back to client
    if (err) {
      console.log(err);
      return res.status(401).json({ errors: {'Upload': ['invalid']}});
    }
    return res.json({signedUrl: signedUrl, path: path});
  });
}
