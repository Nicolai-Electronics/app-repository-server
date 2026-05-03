import express from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import Path from 'path';
import { fileURLToPath } from 'url';
import fs from 'node:fs/promises';
import swagger_ui from 'swagger-ui-dist';

const port = 8001;
let repository_path = Path.join(Path.dirname(fileURLToPath(import.meta.url)), 'repository');
const data_path = '/repository';

repository_path = (typeof process.argv[2] === "string") ? process.argv[2] : repository_path;
const repository_version = Math.floor(new Date().getTime() / 1000);

const app = new express();

// Body parsers

app.use(express.json());
app.use(express.text());
app.use(express.urlencoded({ extended: false }));

// OpenAPI

const openapi_spec_path = Path.join(Path.dirname(fileURLToPath(import.meta.url)), 'api.json');

// Swagger UI
const swagger_ui_initializer = (await fs.readFile(Path.join(swagger_ui.absolutePath(), 'swagger-initializer.js')))
    .toString()
    .replace("https://petstore.swagger.io/v2/swagger.json", "/openapi");
app.get("/swagger-initializer.js", (req, res) => {
    res.setHeader('content-type', 'text/javascript');
    res.status(200).send(swagger_ui_initializer);
});
app.use(express.static(swagger_ui.absolutePath()))

app.use('/openapi', express.static(openapi_spec_path));

app.use(data_path, express.static(repository_path));

app.use(
    OpenApiValidator.middleware({
        apiSpec: openapi_spec_path,
        validateRequests: true,
        validateResponses: true,
    })
);

app.use((err, req, res, next) => {
    // format error
    res.status(err.status || 500).json({
        message: err.message,
        errors: err.errors,
    });
});

// Application

class Repository {
    constructor(repository_path) {
        this.repository_path = repository_path;
        this.index = {
            categories: {},
            categories_per_device: {},
        };
        this.projects = {};
        this.projects_per_device = {};
        console.log('Repository path is ', this.repository_path);
        this.load();
    }

    async load() {
        await this.load_index();
        await this.load_projects();
        await this.create_index_per_device();
    }

    async load_index() {
        this.index = {
            categories: {},
            categories_per_device: {},
        };

        let directories = (await fs.readdir(this.repository_path, { withFileTypes: true })).filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.')).map(dirent => dirent.name);
        for (let directory_index in directories) {
            let directory = directories[directory_index];
            try {
                console.log("Processing app", directory);
                let metadata = JSON.parse(await fs.readFile(Path.join(this.repository_path, directory, "metadata.json")));
                for (let category_index in metadata.categories) {
                    let category = metadata.categories[category_index];
                    let category_slug = category.toLowerCase().replace(" ", "_");
                    if (!(category_slug in this.index.categories)) {
                        console.log("Added category", category_slug);
                        this.index.categories[category_slug] = {
                            name: category,
                            projects: []
                        };
                    }
                    this.index.categories[category_slug].projects.push(directory); // Add slug to metadata
                }
            } catch (e) {
                console.error("Failed to add index entry for", directory, ":", e);
            }
        }
    }

    async load_projects() {
        this.projects = {};
        let app_folders = (await fs.readdir(this.repository_path, { withFileTypes: true })).filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.')).map(dirent => dirent.name);
        for (let index in app_folders) {
            let slug = app_folders[index];
            let metadata = JSON.parse(await fs.readFile(Path.join(this.repository_path, slug, 'metadata.json')), { encoding: 'utf8' });
            this.projects[slug] = {
                slug: slug,
                project: metadata
            };
        }
    }

    async create_index_per_device() {
        for (let project_index in this.projects) {
            let project_wrapper = this.projects[project_index];
            let project = project_wrapper.project;
            for (let application_index in project.application) {
                let application = project.application[application_index];
                for (let target_index in application.targets) {
                    let target = application.targets[target_index];
                    if (!(target in this.index.categories_per_device)) {
                        console.log("New device found:", target);
                        this.index.categories_per_device[target] = {};
                        this.projects_per_device[target] = {};
                    }
                    for (let category_index in project.categories) {
                        let category = project.categories[category_index];
                        let category_slug = category.toLowerCase().replace(" ", "_");
                        if (!(category_slug in this.index.categories_per_device[target])) {
                            console.log("Adding category", category_slug, "to device", target);
                            this.index.categories_per_device[target][category_slug] = {
                                name: this.index.categories[category_slug].name,
                                projects: []
                            };
                        }
                        if (!(project_index in this.index.categories[category_slug].projects)) {
                            console.log("Adding project", project_index, "to category", category_slug, "for device", target);
                            this.index.categories_per_device[target][category_slug].projects.push(project_index);

                        }
                    }
                    if (!(project in this.projects_per_device[target])) {
                        console.log("Adding project", project_index, "to device", target);
                        this.projects_per_device[target][project_index] = project_wrapper;
                    }
                }
            }
        }
    }

    async get_categories(device = null) {
        console.log("Request for get categories", device);
        if (device === null) {
            return Object.keys(this.index.categories);
        } else {
            if (device in this.index.categories_per_device) {
                return Object.keys(this.index.categories_per_device[device]);
            } else {
                return [];
            }
        }
    }

    async get_category(category = null, device = null) {
        if (device == null) {
            if (category === null) {
                return {
                    name: 'All projects',
                    projects: Object.keys(this.projects),
                };
            } else if (category in this.index.categories) {
                return this.index.categories[category];
            }
        } else if (device in this.index.categories_per_device){
            console.log("All projects for", device);
            if (category === null) {
                return {
                    name: 'All projects',
                    projects: Object.keys(this.projects_per_device[device]),
                };
            } else if (category in this.index.categories) {
                console.log("Categories for", device, category, this.index.categories_per_device[device], this.index.categories_per_device[device][category]);
                return this.index.categories_per_device[device][category];
            }
        } else {
            return {
                name: category !== null  ? category : 'All projects',
                projects: [],
            };
        }
        return null;
    }
}

let repository = new Repository(repository_path);

// Routes

app.get('/projects', async (req, res, next) => {
    // Parameters
    let offset = ("offset" in req.query) ? Number(req.query.offset) : 0;
    if (offset === NaN) offset = 0;
    let amount = ("amount" in req.query) ? Number(req.query.amount) : null;
    if (amount === NaN) amount = 0;
    let category_name = (typeof req.query.category === 'string') ? req.query.category : null;
    let device_name = (typeof req.query.device === 'string') ? req.query.device : null;

    // Function
    let category = await repository.get_category(category_name, device_name);
    if (category === null) {
        res.status(404).json({
            message: 'category not found',
            errors: [{
                path: req.path,
                message: 'category not found'
            }],
        });
        return;
    }
    let slugs = category.projects;
    if (amount === null) {
        amount = slugs.length;
    }
    slugs = slugs.slice(offset, offset + amount);

    let projects = [];
    for (let index in slugs) {
        let slug = slugs[index];
        projects.push(repository.projects[slug]);
    }

    res.json(await Promise.all(projects));
});

app.get('/projects/:slug', async (req, res, next) => {
    if (typeof(repository.projects[req.params.slug]) !== 'object' || typeof(repository.projects[req.params.slug].project) !== 'object') {
        res.status(404).json({
            message: 'app not found',
            errors: [{
                path: req.path,
                message: 'app not found'
            }],
        });
        return;
    }
    res.json(repository.projects[req.params.slug].project);
});

app.get('/categories', async (req, res, next) => {
    let device_name = (typeof req.query.device === 'string') ? req.query.device : null;
    let categories = await repository.get_categories(device_name);
    res.json(categories);
});

app.get('/information', async (req, res, next) => {
    res.json({
        "data_path": data_path,
        "version": repository_version,
    });
});

// Server

app.listen(port, () => {
    console.log(`Server running on ${port}`);
});
