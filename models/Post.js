const postsCollection = require("../db").db().collection("posts")
const followsCollection = require("../db").db().collection("follows")
const ObjectID = require("mongodb").ObjectID
const User = require("./User")
const sanitizeHTML = require("sanitize-html")
const upload = require("../middleware/upload")

const testCollection = require("../db").db().collection("test")


postsCollection.createIndex({ title: "text", body: "text" })

let Post = function (data, userid, requestedPostId) {
  this.data = data
  this.errors = []
  this.userid = userid
  this.requestedPostId = requestedPostId
}

Post.prototype.cleanUp = function () {
  if (typeof this.data.title != "string") {
    this.data.title = ""
  }
  if (typeof this.data.body != "string") {
    this.data.body = ""
  }

  // get rid of any bogus properties
  this.data = {
    title: sanitizeHTML(this.data.title.trim(), { allowedTags: [], allowedAttributes: {} }),
    selfClosing: [ 'img', 'br', 'hr', 'area', 'base', 'basefont', 'input', 'link', 'meta' ],

    body: sanitizeHTML(this.data.body.trim(), { allowedTags: ["address", "article", "aside", "footer", "header", "h1", "h2", "h3", "h4",
    "h5", "h6", "hgroup", "main", "nav", "section", "blockquote", "dd", "div",
    "dl", "dt", "figcaption", "figure", "hr", "li", "main", "ol", "p", "pre",
    "ul", "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn",
    "em", "i", "kbd", "mark", "q", "rb", "rp", "rt", "rtc", "ruby", "s", "samp",
    "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr", "caption",
    "col", "colgroup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "img"], allowedAttributes: {  img: [ 'src' ]
  } }),
    createdDate: new Date(),
    author: ObjectID(this.userid)
  }
}

Post.prototype.validate = function () {
  if (this.data.title == "") {
    this.errors.push("You must provide a title.")
  }
  if (this.data.body == "") {
    this.errors.push("You must provide post content.")
  }
}

Post.prototype.create = function () {
  return new Promise((resolve, reject) => {
    this.cleanUp()
    this.validate()
    if (!this.errors.length) {
      // save post into database
      postsCollection
        .insertOne(this.data)
        .then(info => {
          resolve(info.ops[0]._id)
        })
        .catch(e => {
          this.errors.push("Please try again later.")
          reject(this.errors)
        })
    } else {
      reject(this.errors)
    }
  })
}

Post.prototype.update = function () {
  return new Promise(async (resolve, reject) => {
    try {
      let post = await Post.findSingleById(this.requestedPostId, this.userid)
      if (post.isVisitorOwner) {
        // actually update the db
        let status = await this.actuallyUpdate()
        resolve(status)
      } else {
        reject()
      }
    } catch (e) {
      reject()
    }
  })
}

Post.prototype.actuallyUpdate = function () {
  return new Promise(async (resolve, reject) => {
    this.cleanUp()
    this.validate()
    if (!this.errors.length) {
      await postsCollection.findOneAndUpdate({ _id: new ObjectID(this.requestedPostId) }, { $set: { title: this.data.title, body: this.data.body } })
      resolve("success")
    } else {
      resolve("failure")
    }
  })
}

Post.reusablePostQuery = function (uniqueOperations, visitorId, finalOperations = []) {
  return new Promise(async function (resolve, reject) {
    let aggOperations = uniqueOperations
      .concat([
        { $lookup: { from: "users", localField: "author", foreignField: "_id", as: "authorDocument" } },
        {
          $project: {
            title: 1,
            body: 1,
            createdDate: 1,
            authorId: "$author",
            author: { $arrayElemAt: ["$authorDocument", 0] }
          }
        }
      ])
      .concat(finalOperations)

    let posts = await postsCollection.aggregate(aggOperations).toArray()

    // clean up author property in each post object
    posts = posts.map(function (post) {
      post.isVisitorOwner = post.authorId.equals(visitorId)
      post.authorId = undefined

      post.author = {
        username: post.author.username,
        avatar: new User(post.author, true).avatar
      }

      return post
    })

    resolve(posts)
  })
}

Post.findSingleById = function (id, visitorId) {
  return new Promise(async function (resolve, reject) {
    if (typeof id != "string" || !ObjectID.isValid(id)) {
      reject()
      return
    }

    let posts = await Post.reusablePostQuery([{ $match: { _id: new ObjectID(id) } }], visitorId)

    if (posts.length) {
      resolve(posts[0])
    } else {
      reject()
    }
  })
}

Post.findByAuthorId = function (authorId) {
  return Post.reusablePostQuery([{ $match: { author: authorId } }, { $sort: { createdDate: -1 } }])
}

Post.delete = function (postIdToDelete, currentUserId) {
  return new Promise(async (resolve, reject) => {
    try {
      let post = await Post.findSingleById(postIdToDelete, currentUserId)
      if (post.isVisitorOwner) {
        await postsCollection.deleteOne({ _id: new ObjectID(postIdToDelete) })
        resolve()
      } else {
        reject()
      }
    } catch (e) {
      reject()
    }
  })
}

Post.search = function (searchTerm) {
  return new Promise(async (resolve, reject) => {
    if (typeof searchTerm == "string") {
      let posts = await Post.reusablePostQuery([{ $match: { $text: { $search: searchTerm } } }], undefined, [{ $sort: { score: { $meta: "textScore" } } }])
      resolve(posts)
    } else {
      reject()
    }
  })
}

Post.countPostsByAuthor = function (id) {
  return new Promise(async (resolve, reject) => {
    let postCount = await postsCollection.countDocuments({ author: id })
    resolve(postCount)
  })
}

// Add your own user id to this array too
Post.getFeed = async function (id) {
  // create an array of the user ids that the current user follows
  let followedUsers = await followsCollection.find({ authorId: new ObjectID(id) }).toArray()
  followedUsers = followedUsers.map(function (followDoc) {
    return followDoc.followedId
  })
  followedUsers.push(new ObjectID(id))

  // look for posts where the author is in the above array of followed users
  return Post.reusablePostQuery([{ $match: { author: { $in: followedUsers } } }, { $sort: { createdDate: -1 } }])
}

Post.getAllPosts = async function() {
    return Post.reusablePostQuery([{ $match: { } }, { $sort: { createdDate: -1 } }])
}

Post.postImage = async function(req,res) {
  try {
    await upload(req, res);
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

Post.getImage = async function(req,res) {
    const fileName = req.params.filename

    const collection = require("../db").db().collection('photos.files');
    const collectionChunks = require("../db").db().collection('photos.chunks');
    collection.find({filename: fileName}).toArray(function(err, docs){
      if(err){
        return res.status(500).json({title: 'File error', message: 'Error finding file', error: err.errMsg});
      }
      if(!docs || docs.length === 0){
        return res.status(500).json({title: 'Download Error', message: 'No file found'});
      }else{
        //Retrieving the chunks from the db
        collectionChunks.find({files_id : docs[0]._id}).sort({n: 1}).toArray(function(err, chunks){
          if(err){
            return res.status(500).json({title: 'Download Error', message: 'Error retrieving chunks', error: err.errmsg});
          }
          if(!chunks || chunks.length === 0){
            //No data found
            return res.status(500).json({title: 'Download Error', message: 'No data found'});
          }
          //Append Chunks
          let fileData = [];
          for(let i=0; i<chunks.length;i++){
            //This is in Binary JSON or BSON format, which is stored
            //in fileData array in base64 endocoded string format
            fileData.push(chunks[i].data.toString('base64'));
          }
          //Display the chunks using the data URI format
          // let finalFile = 'data:' + docs[0].contentType + ';base64,' + fileData.join('');
          var img = Buffer.from(fileData[0], 'base64');

          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': img.length
          });
          res.end(img);
        });
      }})
}

Post.deleteImages = async function(req,res) {
  const prefix = "http://localhost:8080/file/"
  const urls = req.body.urls
  
  const newUrls = urls.map(url => url.replace(prefix, ""))

  const collection = require("../db").db().collection('photos.files');
  const collectionChunks = require("../db").db().collection('photos.chunks');
  collection.find({filename:{"$in": newUrls}}).toArray(async function(err, docs){
    if(err){
      return res.status(500).json({title: 'File error', message: 'Error finding file', error: err.errMsg});
    }
    if(!docs || docs.length === 0){
      return res.status(500).json({title: 'Download Error', message: 'No file found'});
    }else{
      // Loop through results and delete
      for (let doc of docs) {
        const res = await collectionChunks.deleteOne({files_id: doc._id})
      }
      await collection.deleteMany({filename:{"$in": newUrls}})
    }
    res.json("Deleted")
  })


}

module.exports = Post
