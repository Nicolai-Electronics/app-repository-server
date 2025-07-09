# App repository server

A simple NodeJS server application for presenting an application repository API.

## Installation

As root run the following commands to prepare the server for running this application:

```
cp repository-server.service /etc/systemd/system/repository-server.service
systemctl daemon-reload
systemctl enable --now repository-server

echo "ci ALL=NOPASSWD:/usr/bin/systemctl restart repository-server" > /etc/sudoers.d/repository_restart
```

This expects you to have set up a webserver to serve the files in the repository folder and forward API requests to the server application. You can modify the service file and provided sudo override to change the working directory.

## License

This project is made available under the terms of the [MIT license](LICENSE).
