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

function sendWelcomeSedAppMessage(token, userId, sedChannelId) {
  getRepoLinkText(sedChannelId)
  .then(text => {
    sendDirectMessage(userId, text, token);
  });
}

function sendWelcomeMessage(token, userId, secrets) {
  const text = `
  Welcome! If you are interested in our open source project, please join <#${secrets.SED_APP_CHANNEL}|sed_app_development>.

  For our apps and website, check out <#${secrets.IOS_APP_CHANNEL}|sed_app_ios>, <#${secrets.ANDROID_APP_CHANNEL}|sed_app_android>,  or <#${secrets.WEB_FRONT_CHANNEL}|sed_app_web_frontend>

  You can also join our community and share your own projects at www.softwaredaily.com !`
  sendDirectMessage(userId, text, token);
}

function getSummaryDashboard(GRAFANA_BASE_URL, GRAFANA_API_KEY) {
  const options = {
    url: `${GRAFANA_BASE_URL}/api/dashboards/db/event-summaries`,
    headers: {
      'Authorization': `Bearer ${GRAFANA_API_KEY}`
    }
  };
  return new Promise((resolve, reject) => {
    request(options, function (error, response, body) {
      if (error) {
        reject(error);
      } else {
        resolve(JSON.parse(body).dashboard);
      }
    });
  });
}

function createSnapshot(GRAFANA_BASE_URL, GRAFANA_API_KEY, dashboard) {
  const options = {
    method: 'post',
    url: `${GRAFANA_BASE_URL}/api/snapshots`,
    headers: {
      'Authorization': `Bearer ${GRAFANA_API_KEY}`
    },
    json: true,
    body: {
      expires: 3600,
      dashboard: dashboard,
      name: 'Events API Snapshot'
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

function sendSnapshotUrl(GRAFANA_BASE_URL, GRAFANA_API_KEY, response_url, storage) {
  storage.get(function (error, data) {
    if (error) return sendSameChannelResponse(response_url, `An error occurred: ${error}`);
    if (data && data.monthlySnapshot && (new Date(data.monthlySnapshot.expires) - new Date()) > 0) {
      const timeDiff = new Date(data.monthlySnapshot.expires) - new Date();
      const timelate = new Date() - new Date(data.monthlySnapshot.created);
      sendSameChannelResponse(response_url, `Here's the monthly overview snapshot. It is ${Math.round(((timelate % 86400000) % 3600000) / 60000)} minute(s) timelate and will expire in ${Math.round(((timeDiff % 86400000) % 3600000) / 60000)} minutes: ${data.monthlySnapshot.url}`);
    } else {
      getSummaryDashboard(GRAFANA_BASE_URL, GRAFANA_API_KEY).then(dashboard => {
        return createSnapshot(GRAFANA_BASE_URL, GRAFANA_API_KEY, dashboard)
      }).then(data => {
        sendSameChannelResponse(response_url, `Here's the monthly overview snapshot. It will expire in 30 minutes: ${data.url}`);
        const newData = {
          monthlySnapshot: {
            url: data.url,
            created: new Date().getTime(),
            expires: new Date(new Date().getTime() + 30*60000).getTime()
          }
        };
        storage.set(newData, {force: 1}, function (error) {
          if (error) throw error;
        });
      }).catch(err => {
        sendSameChannelResponse(response_url, `An error occurred: ${err}`)
      });
    }
  });
}

server.post('/', (req, res, next) => {
  if (req.body.token == req.webtaskContext.secrets.slackToken) {
    res.status(200).end();
    const sedAppChannel = (req.body.event.channel == req.webtaskContext.secrets.SED_APP_CHANNEL || req.body.event.channel == req.webtaskContext.secrets.apiTestingChannel);
    const generalChannel = (req.body.event.channel == req.webtaskContext.secrets.GENERAL_CHANNEL);
    if (req.body.event.type == 'member_joined_channel') {
      if (sedAppChannel) {
        sendWelcomeSedAppMessage(req.webtaskContext.secrets.SLACK_API_TOKEN, req.body.event.user, req.webtaskContext.secrets.SED_APP_CHANNEL);
      } else if (generalChannel) {
        sendWelcomeMessage(req.webtaskContext.secrets.SLACK_API_TOKEN, req.body.event.user, req.webtaskContext.secrets);
      }
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
        res.status(200).end();
        if (args[1] && args[1] == 'snapshot') {
          sendSnapshotUrl(req.webtaskContext.secrets.GRAFANA_BASE_URL, req.webtaskContext.secrets.GRAFANA_API_KEY, req.body.response_url, req.webtaskContext.storage);
        } else {
          sendSameChannelResponse(req.body.response_url, "Working on getting user and server stats available this week!");  
        }
        break;
      case 'help':
        sendSameChannelResponse(req.body.response_url, "Try these arguments: \`/sedaily [help|welcome|stats]\`");
        break;
      case 'welcome':
        sendWelcomeMessage(req.webtaskContext.secrets.SLACK_API_TOKEN, req.body.user_id, req.webtaskContext.secrets);
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

server.get('/health-check', (req, res, next) => {
  res.status(200).send('OK');
});

module.exports = Webtask.fromExpress(server);
