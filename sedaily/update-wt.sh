#!/bin/bash


if [[ $1 = '--test' ]]; then
	wt update sedaily-test index.js
elif [[ $1 = '--prod' ]]; then
	wt update sedaily index.js
fi
