const apiRouter = require("express").Router()
const userController = require("./controllers/userController")
const postController = require("./controllers/postController")
const followController = require("./controllers/followController")
const cors = require("cors")

apiRouter.use(cors())

apiRouter.get("/", (req, res) => res.json("Hello, if you see this message that means your backend is up and running successfully. Congrats! Now let's continue learning React!"))

// check token to log out front-end if expired
apiRouter.post("/checkToken", userController.checkToken)

apiRouter.post("/getHomeFeed", userController.apiMustBeLoggedIn, userController.apiGetHomeFeed)
apiRouter.post("/register", userController.apiRegister)
apiRouter.post("/login", userController.apiLogin)
apiRouter.get("/post/:id", postController.reactApiViewSingle)
apiRouter.post("/post/:id/edit", userController.apiMustBeLoggedIn, postController.apiUpdate)
apiRouter.delete("/post/:id", userController.apiMustBeLoggedIn, postController.apiDelete)
apiRouter.post("/create-post", userController.apiMustBeLoggedIn, postController.apiCreate)
apiRouter.post("/search", postController.search)

apiRouter.post("/doesUsernameExist", userController.doesUsernameExist)
apiRouter.post("/doesEmailExist", userController.doesEmailExist)

// profile related routes
apiRouter.post("/profile/:username", userController.ifUserExists, userController.sharedProfileData, userController.profileBasicData)
apiRouter.get("/profile/:username/posts", userController.ifUserExists, userController.apiGetPostsByUsername)
apiRouter.get("/profile/:username/followers", userController.ifUserExists, userController.profileFollowers)
apiRouter.get("/profile/:username/following", userController.ifUserExists, userController.profileFollowing)

// follow routes
apiRouter.post("/addFollow/:username", userController.apiMustBeLoggedIn, followController.apiAddFollow)
apiRouter.post("/removeFollow/:username", userController.apiMustBeLoggedIn, followController.apiRemoveFollow)


// Custom routes
apiRouter.get("/profile", userController.getAllUsers)
apiRouter.get("/post", postController.getAllPosts)

apiRouter.post("/image", postController.postImage)



const MongoClient = require('mongodb');



apiRouter.get("/file/:filename", async (req, res) => {
//     try {
              
//         console.log(req.params.filename)
//         const file = await gfs.files.findOne({ filename: req.params.filename });
//         console.log(file, "found file")
//         const readStream = gfs.createReadStream(file.filename);
//         readStream.pipe(res);
//     } catch (error) {
//         res.send("not found");
//     }
MongoClient.connect("mongodb://root:root@localhost:27017",{ useNewUrlParser: true, useUnifiedTopology: true }, function(err, client){
    const fileName = req.params.filename
    if(err){
      return res.render('index', {title: 'Uploaded Error', message: 'MongoClient Connection error', error: err.errMsg});
    }
    const db = client.db("test");
    
    const collection = db.collection('photos.files');
    const collectionChunks = db.collection('photos.chunks');
    collection.find({filename: fileName}).toArray(function(err, docs){
      if(err){
        return res.render('index', {title: 'File error', message: 'Error finding file', error: err.errMsg});
      }
      if(!docs || docs.length === 0){
        return res.render('index', {title: 'Download Error', message: 'No file found'});
      }else{
        //Retrieving the chunks from the db
        collectionChunks.find({files_id : docs[0]._id}).sort({n: 1}).toArray(function(err, chunks){
          if(err){
            return res.render('index', {title: 'Download Error', message: 'Error retrieving chunks', error: err.errmsg});
          }
          if(!chunks || chunks.length === 0){
            //No data found
            return res.render('index', {title: 'Download Error', message: 'No data found'});
          }
          //Append Chunks
          let fileData = [];
          for(let i=0; i<chunks.length;i++){
            //This is in Binary JSON or BSON format, which is stored
            //in fileData array in base64 endocoded string format
            fileData.push(chunks[i].data.toString('base64'));
          }
          //Display the chunks using the data URI format
          let finalFile = 'data:' + docs[0].contentType + ';base64,' + fileData.join('');
          res.json({title: 'Image File', message: 'Image loaded from MongoDB GridFS', imgurl: finalFile});
        });
      }
      
    });
  });

});

module.exports = apiRouter
