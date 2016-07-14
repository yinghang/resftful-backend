var User       = require('../models/models').User;
var jwt        = require('jsonwebtoken');
var request    = require('request');
var fs         = require('fs');
var strava 	   = require('strava-v3');

// super secret for creating tokens
var superSecret = process.env.SECRET;

var _ = require('underscore')

// personal HR data
var HR_MAX = 208
var HR_REST = 45
// correction factor for intensity
var B_M = 1.92
var B_F = 1.67
// weighing factors fitness/fatigue
var k1 = 1
var k2 = 2
// decay constants fitness/fatigue
var t1 = 42
var t2 = 7
// starting age
var AGE = 60

function getTRIMP(hr, dur) {
	return dur * (hr - HR_REST) / (HR_MAX - hr) * Math.exp(B_M * (hr - HR_REST) / (HR_MAX - hr))
}


var grabData = function grabData(tok,cb) {


	request('https://www.strava.com/api/v3/athlete/activities?access_token=' + tok + '&per_page=200',
		function(error, response, body) {
			if (error) console.log('bummer....')
				else {
					console.log('got it!!')
					var rides = {}
					var oneDay = 24 * 60 * 60 * 1000
					var count = 1
					_.each(JSON.parse(body), function(activity, index) {

						var dayDelta = Math.round(Math.abs((Date.parse(activity.start_date) - Date.now()) / (oneDay)))
						var avgSpeed = Math.round(activity.average_speed * 60 * 60 / 1000 * 100) / 100

						if (activity.has_heartrate && (/^ride/i).test(activity.type)) {
							if (rides[dayDelta])
								rides[dayDelta] += getTRIMP(activity.average_heartrate, Math.round(activity.moving_time / 60 / 60 * 100) / 100)
							else rides[dayDelta] = getTRIMP(activity.average_heartrate, Math.round(activity.moving_time / 60 / 60 * 100) / 100)
						}
				})
					var trimpScores = new Array(180)
					trimpScores = _.map(trimpScores, function(val, index) {
						return rides[index] ? rides[index] : 0
					})

					var data = _.map(trimpScores, function(val, index) {
						var temp = {}
						temp.fitness = k1 * _.reduce(trimpScores.slice(index + 1), function(memo, trimp, i) {
							return memo + trimp * Math.exp(-(i) / t1)
						}, 0)
						temp.fatigue = k2 * _.reduce(trimpScores.slice(index + 1), function(memo, trimp, i) {
							return memo + trimp * Math.exp(-(i) / t2)
						}, 0)
						temp.form = temp.fitness - temp.fatigue > 0 ? temp.fitness - temp.fatigue : 0
						temp.age = Math.round(AGE - temp.form / 10)
						return temp
					})
// _.each(data, function(elt,i) {console.log(i+': '+elt.age)})
var dayReturnArray = [];
var ageReturnArray = [];
_.each(data, function(elt, i) {
	dayReturnArray.push(i)
	ageReturnArray.push(elt.age)
//console.log(i+': '+elt.age)
})
var ageReturnArrayForHealthline = ageReturnArray.reverse()
var dataToVisualize = {}
dataToVisualize["ages"] = ageReturnArrayForHealthline
dataToVisualize["days"] = dayReturnArray
console.log(dataToVisualize)

cb.call(dataToVisualize) // does something with the data
// return dataToVisualize
}
}
)
}

module.exports = function(app, express){
	var apiRouter = express.Router();

	apiRouter.post('/register',function(req, res) {	
var user = new User();		// create a new instance of the User model
user.email = req.body.email;
user.displayName = req.body.displayName;
user.password = req.body.password;
user.location = req.body.location;

user.save(function(err) {
	if (err) {
// duplicate entry
if (err.code == 11000) 
	return res.json({ success: false, message: 'A user with that email already exists. '});
else 
	return res.send(err);
}

// return a message
res.json({ message: 'User created!' });
});
})

// route to authenticate a user (POST http://localhost:3000/api/authenticate)
apiRouter.post('/authenticate', function(req, res) {
	console.log(req.body.email);

// find the user
User.findOne({
	email: req.body.email
}).select('displayName email password').exec(function(err, user) {

	if (err) throw err;

// no user with that username was found
if (!user) {
	res.json({ 
		success: false, 
		message: 'Authentication failed. User not found.' 
	});
} else if (user) {

// check if password matches
var validPassword = user.comparePassword(req.body.password);
if (!validPassword) {
	res.json({
		success: false, 
		message: 'Authentication failed. Wrong password.' 
	});
} else {

// if user is found and password is right
// create a token
var token = jwt.sign({
	id: user._id,
	displayName: user.displayName,
	email: user.email,
	location: user.location
}, superSecret, {
expiresIn: 1440 // expires in 24 hours
})

// return the information including token as JSON
res.json({
	success: true,
	message: 'Enjoy your token!',
	token: token
});
}   

}

});
});

// route middleware to verify a token
apiRouter.use(function(req, res, next) {
// do logging
console.log('Somebody just came to our app!');

// check header or url parameters or post parameters for token
var token = req.body.token || req.query.token || req.headers['x-access-token'];

// decode token
if (token) {

// verifies secret and checks exp
jwt.verify(token, superSecret, function(err, decoded) {      
	if (err){
		res.status(403).send({ 
			success: false, 
			message: 'Failed to authenticate token.' 
		});
	}
	else{
// if everything is good, save to request for use in other routes
req.decoded = decoded;   
next(); // make sure we go to the next routes and don't stop here 
}
});

} else {
// if there is no token
// return an HTTP response of 403 (access forbidden) and an error message
res.status(403).send({ 
	success: false, 
	message: 'No token provided.' 
});
}
});

// accessed at GET http://localhost:3000/api
apiRouter.get('/', function(req, res) {
	res.json({ message: 'hooray! welcome to our api!' });	
});

apiRouter.get('/users', function(req, res) {
	User.find(function(err, users) {
		if (err) res.send(err);

// return the users
res.json(users);
});
});

apiRouter.route('/users/:user_id')

// get the user with that id
.get(function(req, res) {
	User.findById(req.params.user_id, function(err, user) {
		if (err) res.send(err);
		console.log(user);
// return that user
res.json(user);
});
})

// update the user with this id
.put(function(req, res) {
	User.findById(req.params.user_id, function(err, user) {

		if (err) res.send(err);

// set the new user information if it exists in the request
if (req.body.displayName) user.displayName = req.body.displayName;
if (req.body.password) user.password = req.body.password;
if (req.body.email) user.email = req.body.email;
if (req.body.location) user.location = req.body.location;
if (req.body.stravaAccessToken) user.stravaAccessToken = req.body.stravaAccessToken;

// save the user
user.save(function(err) {
	if (err) res.send(err);

// return a message
res.json({ message: 'User updated!' });
});

});
})

// delete the user with this id
.delete(function(req, res) {
	User.remove({
		_id: req.params.user_id
	}, function(err, user) {
		if (err) res.send(err);

		res.json({ message: 'Successfully deleted' });
	});
});

apiRouter.get('/me', function(req, res) {
	console.log("BLAH");
	console.log(req.decoded.id);
	User.findOne({_id: req.decoded.id}, function(err, user) {
		if (err) res.send(err);
		console.log(user);
		res.json(user);
	});
});

apiRouter.post('/strava', function(req, res){
	request.post({url:'https://www.strava.com/oauth/token', form: {code:req.body.code, client_id:process.env.STRAVA_CLIENT_ID, client_secret:process.env.STRAVA_CLIENT_SECRET}}, function(err,httpResponse,body){
		var yep = JSON.parse(body);
		console.log(yep);
		User.findById(req.decoded.id, function(err, user) {
			if (err) res.send(err);
			user.stravaAccessToken = yep.access_token;
			user.strava = 1;

// save the user
user.save(function(err) {
	if (err) res.send(err);
// return a message
res.json({ message: 'User updated!' });
});

});
	});
});

apiRouter.get('/strava_data', function(req, res){
	User.findById(req.decoded.id, function(err, user){
		if (err) res.send(err);
		var blah = user.stravaAccessToken;
		request('https://www.strava.com/api/v3/athlete/activities?access_token=' + blah + '&per_page=200',
			function(error, response, body) {
				if (error) console.log('bummer....')
					else {
						console.log('got it!!')
						var rides = {}
						var oneDay = 24 * 60 * 60 * 1000
						var count = 1
						_.each(JSON.parse(body), function(activity, index) {

							var dayDelta = Math.round(Math.abs((Date.parse(activity.start_date) - Date.now()) / (oneDay)))
							var avgSpeed = Math.round(activity.average_speed * 60 * 60 / 1000 * 100) / 100

							if (activity.has_heartrate && (/^ride/i).test(activity.type)) {
								if (rides[dayDelta])
									rides[dayDelta] += getTRIMP(activity.average_heartrate, Math.round(activity.moving_time / 60 / 60 * 100) / 100)
								else rides[dayDelta] = getTRIMP(activity.average_heartrate, Math.round(activity.moving_time / 60 / 60 * 100) / 100)
							}
					})
						var trimpScores = new Array(180)
						trimpScores = _.map(trimpScores, function(val, index) {
							return rides[index] ? rides[index] : 0
						})

						var data = _.map(trimpScores, function(val, index) {
							var temp = {}
							temp.fitness = k1 * _.reduce(trimpScores.slice(index + 1), function(memo, trimp, i) {
								return memo + trimp * Math.exp(-(i) / t1)
							}, 0)
							temp.fatigue = k2 * _.reduce(trimpScores.slice(index + 1), function(memo, trimp, i) {
								return memo + trimp * Math.exp(-(i) / t2)
							}, 0)
							temp.form = temp.fitness - temp.fatigue > 0 ? temp.fitness - temp.fatigue : 0
							temp.age = Math.round(AGE - temp.form / 10)
							return temp
						})
						// _.each(data, function(elt,i) {console.log(i+': '+elt.age)})
						console.log(data)

						res.json(data.map(function(e) {return e.age}))
						}
					})
				})
			})
		
		return apiRouter;
	}