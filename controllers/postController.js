const Post = require("../models/Post")
const upload = require("../middleware/upload")

exports.apiCreate = function(req, res) {
  let post = new Post(req.body, req.apiUser._id)
  post
    .create()
    .then(function(newId) {
      res.json(newId)
    })
    .catch(function(errors) {
      res.json(errors)
    })
}

exports.apiUpdate = function(req, res) {
  let post = new Post(req.body, req.apiUser._id, req.params.id)
  post
    .update()
    .then(status => {
      // the post was successfully updated in the database
      // or user did have permission, but there were validation errors
      if (status == "success") {
        res.json("success")
      } else {
        res.json("failure")
      }
    })
    .catch(e => {
      // a post with the requested id doesn't exist
      // or if the current visitor is not the owner of the requested post
      res.json("no permissions")
    })
}

exports.apiDelete = function(req, res) {
  Post.delete(req.params.id, req.apiUser._id)
    .then(() => {
      res.json("Success")
    })
    .catch(e => {
      res.json("You do not have permission to perform that action.")
    })
}

exports.search = function(req, res) {
  Post.search(req.body.searchTerm)
    .then(posts => {
      res.json(posts)
    })
    .catch(e => {
      res.json([])
    })
}

exports.reactApiViewSingle = async function(req, res) {
  try {
    let post = await Post.findSingleById(req.params.id, 0)
    res.json(post)
  } catch (e) {
    res.json(false)
  }
}

exports.getAllPosts = async function(req,res) {
    Post.getAllPosts().then(posts => {
      res.json(posts)
    })
    .catch(e => {
      res.json([])
    })
   
}

exports.postImage = async function(req,res) {
  // const url = await Post.postImage(req, res)
  // res(url)
  console.log(req)
  try {
    await upload(req, res);

    console.log(req.file);
    if (req.file == undefined) {
      return res.send(`You must select a file.`);
    }

    // return res.send(`File has been uploaded.`);
    const imgUrl = `http://localhost:8080/file/${req.file.filename}`;
    return res.send(imgUrl);
  } catch (error) {
    console.log(error);
    return res.send(`Error when trying upload image: ${error}`);
  }
}