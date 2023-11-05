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
      response.send("Password too short");
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
  tweet,
  date_time
  from tweet natural join user
  where user_id = ${followingIds[1]}
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

  const getFollowingIds = `
  select following_user_id from follower
  where follower_user_id = ${userId}`;

  const getFollowingIdsResponse = await database.all(getFollowingIds);

  const followingIds = getFollowingIdsResponse.map((eachId) => {
    return eachId.following_user_id;
  });

  const userNames = followingIds.map(async (eachId) => {
    const getNamesQuery = `
      select name from user
      where user_id = ${eachId}`;

    const userName = await database.get(getNamesQuery);
    return userName;
  });
  console.log(userNames);
});
