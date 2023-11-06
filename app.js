const express = require("express");
const app = express();
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
app.use(express.json());
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server started successfully at port 3000");
    });
  } catch (error) {
    console.log(`database error ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secret_key", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API-1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const getUserQuery = `
  select * from user
  where username = '${username}'`;

  const dbResponse = await database.get(getUserQuery);

  if (dbResponse !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    const passLen = password.length;
    if (passLen < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
        insert into user(username,password,name,gender)
        values(
            '${username}',
            '${hashedPassword}',
            '${name}',
            '${gender}'
        )`;
      const dbResponse = await database.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//API-2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const userDataQuery = `
    select * from user
    where username = '${username}'`;

  const dbResponse = await database.get(userDataQuery);

  if (dbResponse !== undefined) {
    const enteredPassword = password;
    const hashedPassword = dbResponse.password;

    const isPasswordsMatched = await bcrypt.compare(
      enteredPassword,
      hashedPassword
    );

    if (isPasswordsMatched) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "secret_key");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//API-3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const username = request.username;

  const getUserIdQuery = `
  select user_id from user
  where username = '${username}'`;

  const getUserIdResponse = await database.get(getUserIdQuery);
  const userId = getUserIdResponse.user_id;

  const getFollowingIds = `
  select following_user_id from follower
  where follower_user_id = ${userId}`;

  const getFollowingIdsResponse = await database.all(getFollowingIds);

  const followingIds = getFollowingIdsResponse.map((eachId) => {
    return eachId.following_user_id;
  });

  const getTweetsQuery = `
  select 
    username,
    tweet.tweet,
    date_time as dateTime
  from (user inner join follower on user.user_id = 
  follower.following_user_id) as t inner join tweet on t.following_user_id 
  = tweet.user_id
  where 
    follower.follower_user_id = ${userId}
  order by 
    tweet.date_time desc
  limit 4`;

  const getTweetsResponse = await database.all(getTweetsQuery);
  response.send(getTweetsResponse);
});

//API-4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const username = request.username;

  const getUserIdQuery = `
  select user_id from user
  where username = '${username}'`;

  const getUserIdResponse = await database.get(getUserIdQuery);
  const userId = getUserIdResponse.user_id;

  const getFollowingNamesQuery = `
  select
    name
  from
    user inner join follower on user.user_id =
    follower.follower_user_id
  where
    follower.following_user_id = ${userId}`;

  const getFollowingNamesResponse = await database.all(getFollowingNamesQuery);
  response.send(getFollowingNamesResponse);
});

//API-5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `
    select user_id from user
    where username = '${username}'`;

  const getUserIdResponse = await database.get(getUserIdQuery);
  const userId = getUserIdResponse.user_id;

  const getUserFollowersNames = `
  select name from user inner join follower
  on user.user_id = follower.following_user_id
  where follower_user_id = ${userId}`;

  const userFollowersNames = await database.all(getUserFollowersNames);
  response.send(userFollowersNames);
});

//API-6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.username;

  const getTweetUserId = `select user_id from tweet where tweet_id = ${tweetId}`;

  const userIdResponse = await database.get(getTweetUserId);
  const tweetUserId = userIdResponse.user_id;

  const getUserIdQuery = `
    select user_id from user
    where username = '${username}'`;

  const getUserIdResponse = await database.get(getUserIdQuery);
  const userId = getUserIdResponse.user_id;

  const getFollowingIds = `
  select user_id from user inner join follower
  on user.user_id = follower.follower_user_id
  where follower.following_user_id = ${userId}`;

  const followingIdsResponse = await database.all(getFollowingIds);

  const followingIds = followingIdsResponse.map((eachItem) => {
    return eachItem.user_id;
  });

  const isFollowing = followingIds.includes(tweetUserId);

  if (isFollowing) {
    const responseQuery = `
      select
        tweet,
        sum(like_id) as likes,
        sum(reply_id) as replies,
        date_time as dateTime
      from (tweet inner join like on tweet.tweet_id = like.tweet_id) as t
       inner join reply on t.tweet_id = reply.tweet_id
      where tweet.tweet_id = ${tweetId}`;

    const queryResponse = await database.all(responseQuery);
    response.send(queryResponse);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API-7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const username = request.username;

    const getTweetUserId = `select user_id from tweet where tweet_id = ${tweetId}`;

    const userIdResponse = await database.get(getTweetUserId);
    const tweetUserId = userIdResponse.user_id;

    const getUserIdQuery = `
    select user_id from user
    where username = '${username}'`;

    const getUserIdResponse = await database.get(getUserIdQuery);
    const userId = getUserIdResponse.user_id;

    const getFollowingIds = `
  select user_id from user inner join follower
  on user.user_id = follower.follower_user_id
  where follower.following_user_id = ${userId}`;

    const followingIdsResponse = await database.all(getFollowingIds);

    const followingIds = followingIdsResponse.map((eachItem) => {
      return eachItem.user_id;
    });

    const isFollowing = followingIds.includes(tweetUserId);

    if (isFollowing) {
      const getResponseQuery = `
        select user.username as "likes" from (tweet inner join like on tweet.tweet_id = like.tweet_id) as t
        inner join user on like.user_id = user.user_id
        where tweet.tweet_id = ${tweetId}`;

      const usernamesResponse = await database.all(getResponseQuery);
      response.send(usernamesResponse);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const username = request.username;

    const getTweetUserId = `select user_id from tweet where tweet_id = ${tweetId}`;

    const userIdResponse = await database.get(getTweetUserId);
    const tweetUserId = userIdResponse.user_id;

    const getUserIdQuery = `
    select user_id from user
    where username = '${username}'`;

    const getUserIdResponse = await database.get(getUserIdQuery);
    const userId = getUserIdResponse.user_id;

    const getFollowingIds = `
  select user_id from user inner join follower
  on user.user_id = follower.follower_user_id
  where follower.following_user_id = ${userId}`;

    const followingIdsResponse = await database.all(getFollowingIds);

    const followingIds = followingIdsResponse.map((eachItem) => {
      return eachItem.user_id;
    });

    const isFollowing = followingIds.includes(tweetUserId);

    if (isFollowing) {
      const getRepliesQuery = `
      select user.name,reply.reply as replies
      from reply inner join user on reply.user_id = user.user_id
      where reply.tweet_id = ${tweetId}`;

      const replies = await database.all(getRepliesQuery);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const username = request.username;

  const getUserIdQuery = `
  select user_id from user
  where username = '${username}'`;

  const userIdResponse = await database.get(getUserIdQuery);
  const userId = userIdResponse.user_id;

  const getTweetsQuery = `
  select 
    tweet,
    sum(like_id) as likes,
    sum(reply_id) as replies,
    date_time as dateTime
  from (tweet inner join like on tweet.user_id = like.user_id) as t inner join
  reply on t.user_id = reply.user_id
  where tweet.user_id = ${userId}
  group by tweet.tweet`;

  const allTweetsResponse = await database.all(getTweetsQuery);
  response.send(allTweetsResponse);
});

//API-10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const username = request.username;

  const getUserId = `
  select user_id from user
  where username = '${username}'`;

  const userIdResponse = await database.get(getUserId);
  const userId = userIdResponse.user_id;

  const tweetToCreate = request.body.tweet;

  const createTweetQuery = `
  insert into tweet(tweet,user_id)
  values(
      '${tweetToCreate}',
      ${userId}
  )`;
  const createTweetResponse = await database.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API-11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const username = request.username;

    const getTweetUserId = `
    select user_id from tweet
    where tweet_id = ${tweetId}`;

    const tweetUserIdResponse = await database.get(getTweetUserId);
    const tweetUserId = tweetUserIdResponse.user_id;

    const getLoginUserId = `
    select user_id from user
    where username = '${username}'`;

    const loggedInUserResponse = await database.get(getLoginUserId);
    const loggedInUserId = loggedInUserResponse.user_id;

    if (loggedInUserId === tweetUserId) {
      const deleteTweetQuery = `
        delete from tweet
        where tweet_id = ${tweetId}`;

      await database.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
