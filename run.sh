#!/bin/sh
if [ -z $D ]; then
	exec yarn start -H 127.0.0.1 -p 9801
else
	exec yarn dev -H 127.0.0.1 -p 9801
fi
