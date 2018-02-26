'use latest';
import request from 'request';
import slack from 'slack-notify';
import bodyParser from 'body-parser';
import express from 'express';
import Webtask from 'webtask-tools';
const server = express();
server.use(bodyParser.json());
server.use(bodyParser.urlencoded({ extended: false }));

function getRepoLinkText(sedChannelId) {
	return new Promise((resolve, reject) => {
	  const options = {
    	url: 'https://api.github.com/orgs/SoftwareEngineeringDaily/repos',
    	headers: {
    		'User-Agent': 'SEDaily'
    	}
    };
		request(options, function (error, response, body) {
			if (error) {
				reject(error);
			} else {
				var text = `Thanks for joining <#${sedChannelId}|sed_app_development>. Check out the <https://softwareengineeringdaily.github.io|SEDaily Open Source Guide>. Also see the list of "good first issues" for each project:\n`;
				JSON.parse(body).forEach(repo => {
					var url = `- <https://github.com/SoftwareEngineeringDaily/${repo.name}/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22|${repo.name}>\n`;
			  	text += url;
				});
				resolve(text);
			}
		});	
	});
}

function sendDirectMessage(channel, text, token) {
	const options = {
		method: 'post',
		url: `https://slack.com/api/chat.postMessage`,
		qs: {
			channel, text, token, icon_emoji: ':sedaily:', username: 'SEDaily App Bot'
		}
	};
	return new Promise((resolve, reject) => {
		request(options, function (error, response, body) {
			if (error) {
				reject(error);
			} else {
				resolve(body);
			}
		});	
	});
}

function sendSameChannelResponse(response_url, text) {
	var slack = require('slack-notify')(response_url);
	slack.send({
	  text: text,
	  ephemeral: true
	});
}

function sendWelcomeMessage(token, userId, sedChannelId) {
  getRepoLinkText(sedChannelId)
  .then(text => {
    sendDirectMessage(userId, text, token);
  });
}

server.post('/', (req, res, next) => {
  if (req.body.token == req.webtaskContext.secrets.slackToken) {
    res.status(200).end();
    const sedAppChannel = (req.body.event.channel == req.webtaskContext.secrets.SED_APP_CHANNEL || req.body.event.channel == req.webtaskContext.secrets.apiTestingChannel);
    if (req.body.event.type == 'member_joined_channel' && sedAppChannel) {
      sendWelcomeMessage(req.webtaskContext.secrets.SLACK_API_TOKEN, req.body.event.user, req.webtaskContext.secrets.SED_APP_CHANNEL);
    }
  } else {
    console.log('recieved Unauthorized event');
    res.status(401).send('Unauthorized');
  }
});

server.post('/test', (req, res, next) => {
  if (req.body.token == req.webtaskContext.secrets.slackToken) {
    res.status(200).end();
    const slackApiToken =req.webtaskContext.secrets.SLACK_API_TOKEN;
    const args = req.body.text.split(' ');
    switch (args[0]) {
      case 'stats':
        sendSameChannelResponse(req.body.response_url, "Working on getting user and server stats available this week!");
        break;
      case 'help':
        sendSameChannelResponse(req.body.response_url, "Try these arguments: \`/sedaily [help|welcome|stats]\`");
        break;
      case 'welcome':
        console.log(req.body)
        sendWelcomeMessage(req.webtaskContext.secrets.SLACK_API_TOKEN, req.body.user_id, req.webtaskContext.secrets.SED_APP_CHANNEL);
        break;
      default:
        sendSameChannelResponse(req.body.response_url, 'Arguments not recognized. For help try using \`/sedaily help\`');
        break;
    }
  } else {
    console.log('recieved Unauthorized event');
    res.status(401).send('Unauthorized');
  }
});

module.exports = Webtask.fromExpress(server);
