import express from 'express';
import { Pool } from 'pg';

const app = express();
const port = 3000;

const pool = new Pool({
    user: process.env.DB_USER || 'mynewuser',
    host: process.env.DB_HOST || '91.229.91.103',
    database: process.env.DB_NAME || 'diag',
    password: process.env.DB_PASSWORD || 'mypassword',
    port: parseInt(process.env.DB_PORT || '5432'),
    ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: false,  // This accepts self-signed certificates
        // You can also specify CA if you have one:
        // ca: process.env.DB_CA_CERT
    } : false,
    // Serverless optimizations:
    max: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    // Add keepalive to prevent connection drops
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000
});



app.use(express.json());

// Health check endpoint for Vercel
app.get('/api/health', async (req, res) => {
    try {
        const client = await getConnection();
        await client.query('SELECT NOW()');
        client.release();
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch (err) {
        console.error('Health check failed:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

async function getConnection() {
    try {
        return await getConnection();
    } catch (err) {
        console.error('Failed to connect to database:', err);
        throw new Error('Database connection failed');
    }
}

app.delete('/api/:request', async (req, res) => {
    const { request } = req.params;
    const data = req.body
    console.log(request);
    console.log(req.params);
    console.log(data);
    console.log("DELETE request for table: ", request)
    let client;
    try {
        client = await getConnection();
        await client.query('BEGIN')
        switch (request) {
            case "users":
                await client.query(`
                    DELETE from diag.users
                    WHERE id = $1
                    `, [data[0]]);
                break;
            case "diseases":
                await client.query(`
                    DELETE from diag.diseases
                    WHERE id = $1
                    `, [data[0]])
                break;
            case "eye-metrics":
                await client.query(`
                    DELETE from diag.metrics
                    WHERE id = $1
                    `, [data[0]])
                break;
            case "reference-groups":
                await client.query(`
                    DELETE from diag.reference_groups
                    WHERE id = $1
                    `, [data[0]])
                break;
            case "reference-values":
                await client.query(`
                    DELETE from diag.metric_statistics
                    WHERE id = $1
                    `, [data[0]])
                break;
            case "diagnostic-thresholds":
                await client.query(`
                    DELETE from diag.disease_severities
                    WHERE id = $1
                    `, [data[0]])
                break;
            case "weights":
                const rows = await client.query(`
                SELECT 
                    dmw.disease_id as "disease_id",
                    dmw.metric_id as "metric_id"
                FROM diag.disease_metric_weights dmw
                JOIN diag.diseases ON diseases.id = dmw.disease_id
                JOIN diag.metrics ON metrics.id = dmw.metric_id
                WHERE diseases.name = $1
                AND metrics.name = $2;
                `, [data[0], data[1]])
                console.log(rows);
                await client.query(`
                    DELETE from diag.disease_metric_weights
                    WHERE disease_id = $1 AND metric_id = $2
                    `, [rows.rows[0].disease_id, rows.rows[0].metric_id])
                break;
            case "test-results":
                await client.query(`
                    DELETE from diag.examination_sessions
                    WHERE id = $1
                    `, [data[0]])
                break;
            case "default":
                res.status(400).json({ error: 'Invalid request type' });
                break;
        }
        await client.query('COMMIT');

        res.status(200).json({ d: 'we gucci' });
    }
    catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('Error processing update:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (client) client.release();
    }

})
// Authentication endpoint
app.post('/api/auth', async (req, res) => {
    const { username, password } = req.body;
    console.log('Auth request for username:', username, password);

    try {
        const user = await checkAuth(username, password);
        if (!user) {
            console.log('wrong credantials')
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        console.log(user)
        res.json({ role: user.role, userId: user.id });
    } catch (err) {
        console.error('Auth error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/:request', async (req, res) => {
    const { request } = req.params;
    console.log(request);
    console.log(req.params);
    console.log(req.body);
    console.log("POST request for table: ", request)
    let client;
    const data = req.body;

    switch (request) {
        case "edit_user":
            client = await getConnection();
            try {
                console.log(data)
                const { id, username, password, name, birth_date, gender, role } = data;
                console.log(id, username, password, name, birth_date, gender);
                await client.query('BEGIN');
                console.log('editing')
                await client.query(`
                    UPDATE diag.users
                    SET username = $1,
                        password = $2,
                        name = $3
                        WHERE id = $4
                        `, [username, password, name, id])
                if (role === "Пациент") {
                    await client.query(`
                        UPDATE diag.patients
                        SET
                            birth_date = $2,
                            gender = $3
                            WHERE id = $1
                        `, [id, birth_date, gender.gender]);
                }
                
                await client.query('COMMIT');

                res.status(200).json({ d: 'we gucci' });
            }
            catch (err) {
                if (client) await client.query('ROLLBACK');
                console.error('Error processing update:', err);
                res.status(500).json({ error: 'Internal server error' });
            } finally {
                if (client) client.release();
            }
            break;
        case "add_user":
            client = await getConnection();
            try {
                console.log(data)
                const { id, username, password, name, role_id, birth_date, gender } = data;
                console.log(id, username, password, name, role_id, birth_date, gender.gender);
                await client.query('BEGIN');
                if (!id) {
                    console.log("adding")
                    const userId = await client.query(`
                        INSERT INTO diag.users
                        (username, password, name, role_id)
                        VALUES ($1, $2, $3, $4)
                        RETURNING id;
                        `, [username, password, name, role_id]);
                    console.log(userId.rows[0].id);
                    if (Number(role_id) === 4) {
                        await client.query(`
                        INSERT INTO diag.patients
                        (id, birth_date, gender)
                        VALUES ($1, $2, $3)
                        `, [userId.rows[0].id, birth_date, gender.gender]);
                    }
                }
                else {
                    console.log('editing')
                    await client.query(`
                    UPDATE diag.users
                    SET username = $1,
                        password = $2,
                        name = $3,
                        role_id = $4
                        WHERE id = $5
                        `, [username, password, name, role_id, id])
                    if (Number(role_id) === 4) {
                        await client.query(`
                        UPDATE diag.patients
                        SET
                            birth_date = $2,
                            gender = $3
                            WHERE id = $1
                        `, [id, birth_date, gender.gender]);
                    }
                }
                await client.query('COMMIT');

                res.status(200).json({ d: 'we gucci' });
            }
            catch (err) {
                if (client) await client.query('ROLLBACK');
                console.error('Error processing update:', err);
                res.status(500).json({ error: 'Internal server error' });
            } finally {
                if (client) client.release();
            }
            break;
        case "add_disease":
            client = await getConnection();
            try {
                console.log(data)
                const { id, name } = data;
                await client.query('BEGIN');
                if (!id) {
                    console.log("adding")
                    await client.query(`
                        INSERT INTO diag.diseases
                        (name)
                        VALUES ($1)
                        RETURNING id;
                        `, [name]);
                }
                else {
                    console.log('editing')
                    await client.query(`
                    UPDATE diag.diseases
                    SET name = $1
                    WHERE id = $2
                    `, [name, id])
                }
                await client.query('COMMIT');

                res.status(200).json({ d: 'we gucci' });
            }
            catch (err) {
                if (client) await client.query('ROLLBACK');
                console.error('Error processing update:', err);
                res.status(500).json({ error: 'Internal server error' });
            } finally {
                if (client) client.release();
            }

            break;
        case "add-ref-group":
            client = await getConnection();
            try {
                console.log(data)
                const { id, name, age_min, age_max, sample_size } = data;
                await client.query('BEGIN');
                if (!id) {
                    console.log("adding")
                    await client.query(`
                        INSERT INTO diag.reference_groups
                        (name, age_min, age_max, sample_size)
                        VALUES ($1, $2, $3, $4)
                        `, [name, age_min, age_max, sample_size]);
                }
                else {
                    console.log('editing')
                    await client.query(`
                    UPDATE diag.reference_groups
                    SET name = $1,
                        age_min = $2,
                        age_max = $3,
                        sample_size = $4
                    WHERE id = $5
                    `, [name, age_min, age_max, sample_size, id])
                }
                await client.query('COMMIT');

                res.status(200).json({ d: 'we gucci' });
            }
            catch (err) {
                if (client) await client.query('ROLLBACK');
                console.error('Error processing update:', err);
                res.status(500).json({ error: 'Internal server error' });
            } finally {
                if (client) client.release();
            }
            break;
        case "add-ref-metric":
            client = await getConnection();
            try {
                console.log(data)
                const { id, metric_id, reference_group_id, p5, p50, p95, std_dev } = data;
                await client.query('BEGIN');
                if (!id) {
                    console.log("adding")
                    await client.query(`
                        INSERT INTO diag.metric_statistics
                        (metric_id, reference_group_id, p5, p50, p95, std_dev)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        `, [metric_id, reference_group_id, p5, p50, p95, std_dev]);
                }
                else {
                    console.log('editing')
                    await client.query(`
                    UPDATE diag.metric_statistics
                    SET metric_id = $1,
                    reference_group_id = $2,
                    p5 = $3,
                    p50 = $4,
                    p95 = $5,
                    std_dev = $6
                    WHERE id = $7
                    `, [metric_id, reference_group_id, p5, p50, p95, std_dev, id]);
                }
                await client.query('COMMIT');

                res.status(200).json({ d: 'we gucci' });
            }
            catch (err) {
                if (client) await client.query('ROLLBACK');
                console.error('Error processing update:', err);
                res.status(500).json({ error: 'Internal server error' });
            } finally {
                if (client) client.release();
            }
            break;
        case "add_metric":
            client = await getConnection();
            try {
                console.log(data)
                const { id, name, unit } = data;
                await client.query('BEGIN');
                if (!id) {
                    console.log("adding")
                    await client.query(`
                        INSERT INTO diag.metrics
                        (name, unit)
                        VALUES ($1, $2)
                        `, [name, unit]);
                }
                else {
                    console.log('editing')
                    await client.query(`
                    UPDATE diag.metrics
                    SET name = $1,
                        unit = $2
                    WHERE id = $3
                    `, [name, unit, id])
                }
                await client.query('COMMIT');

                res.status(200).json({ d: 'we gucci' });
            }
            catch (err) {
                if (client) await client.query('ROLLBACK');
                console.error('Error processing update:', err);
                res.status(500).json({ error: 'Internal server error' });
            } finally {
                if (client) client.release();
            }
            break;
        case "update_sev_row":
            updateSeverityRow(req.body, req, res);
            break;
        case "update_weight_row":
            updateWeightRow(req.body, req, res);
            break;
        case "update_examination_session":
            const { examination_session_id, session_metrics, metric_analysis_results, examination_session } = req.body;
            try {
                client = await getConnection();
                await client.query('BEGIN');

                const disease_id = examination_session[0].disease_id;
                const severity_id = examination_session[0].C_id;
                const integral_idx = Number(examination_session[0].idx).toFixed(2);
                await client.query(`
                UPDATE diag.examination_sessions
                SET suspected_disease_id = $1,
                    suspected_severity = $2,
                    integral_idx = $4
                WHERE id = $3
            `, [disease_id, severity_id, examination_session_id, integral_idx]);

                for (const sm of session_metrics) {
                    const metric_id = sm.metric_id;
                    const metric_value_str = sm.metric;
                    const metric_value = Math.ceil(parseFloat(metric_value_str) * 100) / 100;

                    const smRes = await client.query(`
                    SELECT id FROM diag.session_metrics
                    WHERE session_id = $1 AND metric_id = $2
                    LIMIT 1
                `, [examination_session_id, metric_id]);

                    let sm_id;
                    if (smRes.rows.length > 0) {
                        sm_id = smRes.rows[0].id;
                        await client.query(`
                        UPDATE diag.session_metrics
                        SET metric_value = $1
                        WHERE id = $2
                    `, [metric_value, sm_id]);
                    } else {
                        // Insert new
                        const insertRes = await client.query(`
                        INSERT INTO diag.session_metrics (session_id, metric_id, metric_value, reference_group_id)
                        VALUES ($1, $2, $3, NULL)
                        RETURNING id
                    `, [examination_session_id, metric_id, metric_value]);
                        sm_id = insertRes.rows[0].id;
                    }

                    // Find corresponding analysis
                    const analysis = metric_analysis_results.find(a => a.metric_id === metric_id);
                    if (analysis) {
                        const percentile = Math.ceil(analysis.P * 100) / 100;
                        // Upsert into metric_analysis_results
                        await client.query(`
                        INSERT INTO diag.metric_analysis_results (session_metric_id, percentile_rank)
                        VALUES ($1, $2)
                        ON CONFLICT (session_metric_id) DO UPDATE SET percentile_rank = $2;
                    `, [sm_id, percentile]);
                    }
                }

                await client.query('COMMIT');
                res.status(200).json({ d: 'we gucci' });
            } catch (err) {
                if (client) await client.query('ROLLBACK');
                console.error('Error processing update:', err);
                res.status(500).json({ error: 'Internal server error' });
            } finally {
                if (client) client.release();
            }
            break;
        case 'add_new_examination_session':
            await addNewExaminationSession(req.body, req, res);
            break;
        default:
            res.status(400).json({ error: 'Invalid request type' });
    }
});

async function addNewExaminationSession(data, req, res) {
    let client = await getConnection();
    try {
        const { doctor_id, patient_id, session_metrics } = data;

        await client.query('BEGIN');

        // Get reference group ID
        const referenceGroupResult = await client.query(`
            SELECT id
            FROM diag.reference_groups
            WHERE (
                EXTRACT(YEAR FROM AGE(CURRENT_DATE, (SELECT birth_date FROM diag.patients WHERE id = $1))) 
                > reference_groups.age_min 
                AND 
                EXTRACT(YEAR FROM AGE(CURRENT_DATE, (SELECT birth_date FROM diag.patients WHERE id = $1))) 
                < reference_groups.age_max
                )
            LIMIT 1
            `, [patient_id]);

        const referenceGroupId = referenceGroupResult.rows[0]?.id;
        if (!referenceGroupId) {
            throw new Error('No reference group found for patient');
        }

        // Insert examination session
        const examinationSessionResult = await client.query(`
            INSERT INTO diag.examination_sessions
                (patient_id, examined_by, device_model, software_version, examination_date)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            RETURNING id
            `, [patient_id, doctor_id, "ПК", "0.0.1a"]);

        const examinationSessionId = examinationSessionResult.rows[0].id;

        // Insert session metrics
        for (let i = 0; i < session_metrics.length; i++) {
            const sessionMetricResult = await client.query(`
                INSERT INTO diag.session_metrics
                (session_id, metric_id, metric_value, reference_group_id)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            `, [examinationSessionId, session_metrics[i].metric_id, session_metrics[i].metric, referenceGroupId]);

            const sessionMetricId = sessionMetricResult.rows[0].id;

            await client.query(`
                INSERT INTO diag.metric_analysis_results 
                    (session_metric_id, percentile_rank)
                    VALUES ($1, NULL)
            `, [sessionMetricId]);
        }

        await client.query('COMMIT');
        res.status(200).json({ d: 'we gucci' });
    }
    catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('Error processing update:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (client) client.release();
    }
}
async function updateWeightRow(data, req, res) {
    let client = await getConnection();
    try {
        console.log(data)
        const { old_disease_id, old_metric_id, disease_id, metric_id, weight } = data;
        // console.log(weights)
        // const { disease_id, metric_id, weight } = weights;
        // console.log(disease_id, metric_id, weight);
        // await client.query('BEGIN');
        // const numOfExistentRows = await client.query(`
        //     SELECT COUNT(*)
        //     WHERE disease_id = $1 AND metric_id = $2
        //     FROM disease_metric_weights;`, [old_disease_id, old_metric_id])
        if (old_disease_id && old_metric_id) {
            console.log('editing');
            await client.query(`
                UPDATE diag.disease_metric_weights 
                SET weight = $1,
                disease_id = $2,
                metric_id = $3 
                WHERE disease_id = $4 AND metric_id = $5`,
                [weight, disease_id, metric_id, old_disease_id, old_metric_id]);

        }
        else {
            console.log('adding');
            await client.query(`
                INSERT INTO diag.disease_metric_weights 
                (disease_id, metric_id, weight)
                VALUES ($1, $2, $3)`,
                [disease_id, metric_id, weight]);
        }
        // if (numOfExistentRows > 0) {

        //     await client.query(`
        //         UPDATE
        //         diag.disease_metric_weights SET weight = $1 
        //         WHERE disease_id = $2 AND metric_id = $3`,
        //         [weight, disease_id, metric_id]);
        // }
        // else {
        //     await client.query(`
        //         INSERT INTO
        //         (disease_id, metric_id, weight)
        //         VALUES ($1, $2, $3)`,
        //         [disease_id, metric_id, weight]);
        // }   
        await client.query('COMMIT');

        res.status(200).json({ d: 'we gucci' });
    }
    catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('Error processing update:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (client) client.release();
    }
}
async function updateSeverityRow(data, req, res) {
    let client = await getConnection();
    try {
        console.log(data)
        // const {id, Tmax, Tmin, C} = data;
        const sanitized = Object.fromEntries(
            Object.entries(data).map(([key, value]) => [
                key,
                value === '' ? null : value
            ])
        );
        // Then destructure if needed
        const { id, Tmax, Tmin, C, disease_id } = sanitized;
        await client.query('BEGIN');
        if (id) {
            await client.query(`
                UPDATE
                diag.disease_severities 
                SET min_integral_index = $1, 
                max_integral_index = $2,
                severity = $3,
                disease_id = $4 
                WHERE id = $5`, [Tmin, Tmax, C, disease_id, id]);
        }
        else {
            await client.query(`
                INSERT INTO diag.disease_severities
                    (min_integral_index, max_integral_index, severity, disease_id) 
                VALUES ($1, $2, $3, $4)
                `, [Tmin, Tmax, C, disease_id]);
        }
        await client.query('COMMIT');

        res.status(200).json({ d: 'we gucci' });
    }
    catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('Error processing update:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (client) client.release();
    }
}
// Generic GET endpoint for data requests
app.get('/api/:request', async (req, res) => {
    const { request } = req.params;
    let { tableName, id } = req.query;
    console.log(`GET request: ${request} for table: ${tableName}, id: ${id}`);

    try {
        let data;
        switch (request) {
            case 'full-tables':
                data = await getFullTableData(tableName, id);
                break;
            case 'row':
                if (!id) {
                    return res.status(400).json({ error: 'ID is required for row request' });
                }
                data = await getRowData(tableName, id);
                break;
            default:
                return res.status(400).json({ error: 'Invalid request type' });
        }
        res.status(200).json({ info: data });
    } catch (err) {
        console.error('Error processing request:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper function for authentication
async function checkAuth(username, password) {
    const result = await pool.query(`
        SELECT 
            users.id,
            roles.name AS role 
        FROM diag.users 
        JOIN diag.roles ON users.role_id = roles.id 
        WHERE users.username = $1 AND users.password = $2
    `, [username, password]);

    return result.rows.length > 0 ? result.rows[0] : null;
}

// Helper function to normalize id to an array of strings
function normalizeId(id) {
    if (Array.isArray(id)) {
        return id.map(String); // Ensure strings
    } else if (typeof id === 'string') {
        return id.split(',');
    } else {
        return [];
    }
}

// Helper function to get a single row's data
async function getRowData(tableName, id) {
    let result;
    let ids = normalizeId(id); // Normalize to array

    switch (tableName) {
        case 'users':
            if (ids.length !== 1) throw new Error('Expected single ID for users');
            result = await pool.query(`
                SELECT 
                    users.id,
                    users.username,
                    users.password,
                    users.name,
                    users.role_id,
                    patients.birth_date,
                    patients.gender
                FROM diag.users
                LEFT JOIN diag.patients ON users.id = patients.id
                WHERE users.id = $1
            `, [Number(ids[0])]);
            return result.rows[0];
        case 'personal_data':
            if (ids.length !== 1) throw new Error('Expected single ID for personal_data');
            result = await pool.query(`
                SELECT 
                    users.id as id,
                    users.username as "Логин",
                    users.password as "Пароль",
                    users.name as "ФИО",
                    roles.name as "Роль",
                    patients.birth_date as "Дата рождения",
                    patients.gender as "Пол"
                FROM diag.users
                JOIN diag.roles ON users.role_id = roles.id
                LEFT JOIN diag.patients ON users.id = patients.id
                WHERE users.id = $1
            `, [Number(ids[0])]);
            return result.rows[0];
        case 'medications':
            if (ids.length !== 1) throw new Error('Expected single ID for medications');
            result = await pool.query(`
                SELECT * FROM diag.medicine WHERE id = $1
            `, [Number(ids[0])]);
            return result.rows[0];
        case 'medicine_contraindicated_for':
            if (ids.length !== 1) throw new Error('Expected single ID for medicine_contraindicated_for');
            result = await pool.query(`
                SELECT disease_id 
                FROM diag.medicine_contraindicated_for 
                WHERE medicine_id = $1
            `, [Number(ids[0])]);
            return result.rows;
        case 'medicine_treats_disease':
            if (ids.length !== 1) throw new Error('Expected single ID for medicine_treats_disease');
            result = await pool.query(`
                SELECT disease_id 
                FROM diag.medicine_treats_disease 
                WHERE medicine_id = $1
            `, [Number(ids[0])]);
            return result.rows;
        case 'diseases':
            if (ids.length !== 1) throw new Error('Expected single ID for diseases');
            result = await pool.query(`
                SELECT * 
                FROM diag.diseases 
                WHERE id = $1
            `, [Number(ids[0])]);
            return result.rows[0];
        case 'diseases_by_ids':
            const diseaseIds = ids.map(Number);
            result = await pool.query(`
                SELECT name, id as "disease_id"
                FROM diag.diseases 
                WHERE id = ANY($1::int[])
            `, [diseaseIds]);
            return result.rows;
        case 'eye-metrics':
            result = await pool.query(`
                SELECT name, id, unit
                FROM diag.metrics 
                WHERE id = $1
            `, [ids[0]]);
            return result.rows[0];
        case 'metrics_by_ids':
            const metricIds = ids.map(Number);
            result = await pool.query(`
                SELECT name, id as "metric_id"
                FROM diag.metrics 
                WHERE id = ANY($1::int[])
            `, [metricIds]);
            return result.rows;
        case 'test-results':
            // if (ids.length !== 2) throw new Error('Expected two IDs for test-results (patientId, sessionId)');
            // const patientId = Number(ids[0]);
            const sessionId = Number(ids[0]);
            result = await pool.query(`
                SELECT 
                    sm.id as "id",
                    es.id as "id сессии тестирования",
                    metrics.name as "Название метрики",
                    sm.metric_id as "id метрики",
                    sm.metric_value as "Числовое значение",
                    metrics.unit as "Ед. измерения"
                FROM diag.session_metrics sm
                JOIN diag.metrics on metrics.id = sm.metric_id
                JOIN diag.examination_sessions es on es.id = sm.session_id
                WHERE es.id = $1
                ORDER BY es.id ASC
            `, [sessionId]);
            return result.rows;
        case 'reference-groups':
            result = await pool.query(`
                SELECT 
                    id,
                    name,
                    age_min,
                    age_max,
                    sample_size
                FROM diag.reference_groups
                WHERE id = $1
            `, [ids[0]]);
            return result.rows[0];
        case 'reference-values':
            result = await pool.query(`
                SELECT
                    metric_statistics.id as "id",
                    metric_statistics.metric_id as "metric_id",
                    metric_statistics.reference_group_id as "ref_id",
                    metric_statistics.p5 as "p5",
                    metric_statistics.p50 as "p50",
                    metric_statistics.p95 as "p95",
                    metric_statistics.std_dev as "s"
                FROM diag.metric_statistics
                WHERE metric_statistics.id = $1;
            `, [Number(ids[0])]);
            return result.rows[0];
        case 'reference_data':
            if (ids.length !== 1) throw new Error('Expected single ID for reference_data');
            result = await pool.query(`
                SELECT
                    metric_statistics.id as "id",
                    metrics.id as "metric_id",
                    metric_statistics.p5 as "p5",
                    metric_statistics.p50 as "p50",
                    metric_statistics.p95 as "p95",
                    metric_statistics.std_dev as "s"
                FROM diag.metric_statistics
                JOIN diag.reference_groups ON reference_groups.id = metric_statistics.reference_group_id
                JOIN diag.metrics ON metrics.id = metric_statistics.metric_id
                WHERE (
                    EXTRACT(YEAR FROM AGE(CURRENT_DATE, (SELECT birth_date FROM diag.patients WHERE id = $1))) 
                    > reference_groups.age_min 
                    AND 
                    EXTRACT(YEAR FROM AGE(CURRENT_DATE, (SELECT birth_date FROM diag.patients WHERE id = $1))) 
                    < reference_groups.age_max
                )
            `, [Number(ids[0])]);
            return result.rows;
        case 'weights':
            let query = `
                SELECT 
                    dmw.disease_id as "disease_id",
                    dmw.metric_id as "metric_id",
                    dmw.weight as "w"
                FROM diag.disease_metric_weights dmw
            `;
            let params = [];
            if (ids.length > 0) {
                const metricIds = ids.map(Number);
                query += ` WHERE dmw.metric_id = ANY($1::int[])`;
                params = [metricIds];
            }
            result = await pool.query(query, params);
            return result.rows;
        case 'weights_by_ids':
            let query2 = `
            SELECT 
                dmw.disease_id as "disease_id",
                dmw.metric_id as "metric_id",
                dmw.weight as "w"
            FROM diag.disease_metric_weights dmw
            JOIN diag.diseases ON diseases.id = dmw.disease_id
            JOIN diag.metrics ON metrics.id = dmw.metric_id
            WHERE diseases.name = $1
            AND metrics.name = $2;
            `;
            // const params3 = [ids.map(Number)];
            result = await pool.query(query2, ids);
            return result.rows;
        case 'diagnostic-thresholds':
            let queryThresholds1 = `
                SELECT
                
                    ds.disease_id as "disease_id",
                    ds.min_integral_index as "Tmin",
                    ds.max_integral_index as "Tmax",
                    ds.severity as "C",
                    ds.id as "severity_id"
                FROM diag.disease_severities ds
            `;
            let paramsThresholds1 = [];
            if (ids.length > 0) {
                const diseaseIds = ids.map(Number);
                queryThresholds1 += ` WHERE ds.id = ANY($1::int[])`;
                paramsThresholds1 = [diseaseIds];
            }
            result = await pool.query(queryThresholds1, paramsThresholds1);
            return result.rows;
        case 'thresholds':
            let queryThresholds = `
                SELECT
                    ds.disease_id as "disease_id",
                    ds.min_integral_index as "Tmin",
                    ds.max_integral_index as "Tmax",
                    ds.severity as "C",
                    ds.id as "severity_id"
                FROM diag.disease_severities ds
            `;
            let paramsThresholds = [];
            if (ids.length > 0) {
                const diseaseIds = ids.map(Number);
                queryThresholds += ` WHERE ds.disease_id = ANY($1::int[])`;
                paramsThresholds = [diseaseIds];
            }
            result = await pool.query(queryThresholds, paramsThresholds);
            return result.rows;
        default:
            throw new Error(`Unknown table: ${tableName}`);
    }
}

// Helper function to get full table data
async function getFullTableData(tableName, id) {
    let result;
    let ids = normalizeId(id); // Normalize if needed, but for full-tables, id might be single for filtering
    let query = ``;
    let params = [];
    switch (tableName) {
        case 'roles':
            result = await pool.query(`
                SELECT * FROM diag.roles
                ORDER BY id ASC
            `);
            break;
        case 'users':
            result = await pool.query(`
                SELECT 
                    users.id AS ID,
                    users.username AS "Логин",
                    users.password AS "Пароль",
                    users.name AS "ФИО",
                    roles.name AS "Роль"
                FROM diag.users 
                JOIN diag.roles ON users.role_id = roles.id
                ORDER BY users.id ASC
            `);
            break;
        case 'doctors':
            result = await pool.query(`
                SELECT 
                    users.id AS "id",
                    users.name AS "name"
                FROM diag.users 
                JOIN diag.roles ON users.role_id = roles.id
                WHERE roles.id = 3
                ORDER BY id ASC
                `);
            break;
        case 'patients':
            result = await pool.query(`
                SELECT 
                    users.id AS "id",
                    users.name AS "name"
                FROM diag.users 
                JOIN diag.roles ON users.role_id = roles.id
                WHERE roles.id = 4
                ORDER BY id ASC
                `);
            break;
        case 'medications':
            result = await pool.query(`
                SELECT 
                    medicine.id AS "id",
                    medicine.name AS "Название"
                FROM diag.medicine
                ORDER BY id ASC
            `);
            break;
        case 'diseases':
            result = await pool.query(`
                SELECT 
                    id as "id",
                    name as "Название"
                FROM diag.diseases
                ORDER BY id ASC
            `);
            break;
        case 'medical_norms_groups':
            result = await pool.query(`
                SELECT 
                    id as "id",
                    name as "Название",
                    age_min as "Минимальный возраст, лет",
                    age_max as "Максимальный возраст, лет",
                    sample_size as "Размер группы, чел.",
                FROM diag.reference_groups
                ORDER BY id ASC
            `);
            break;
        case 'diagnostic-thresholds':
            result = await pool.query(`
                SELECT 
                    disease_severities.id as "id",
                    diseases.name as "Заболевание",
                    disease_severities.severity as "Степень заболевания",
                    COALESCE(disease_severities.min_integral_index::text, 'Неопределен') as "Минимальный интегральный индекс",
                    COALESCE(disease_severities.max_integral_index::text, 'Неопределен') as "Максимальный интегральный индекс"
                FROM diag.disease_severities
                JOIN diag.diseases ON disease_severities.disease_id = diseases.id
                ORDER BY disease_severities.id ASC
            `);
            break;
        case 'eye-metrics':
            result = await pool.query(`
                SELECT 
                    id as "id",
                    name as "Название",
                    unit as "Единица измерения"
                FROM diag.metrics
                ORDER BY id ASC
            `);
            break;
        case 'reference-values':
            result = await pool.query(`
                SELECT 
                    metric_statistics.id as "id",
                    metrics.name as "Метрика",
                    reference_groups.name as "Группа клинических норм",
                    metric_statistics.p5 as "5 процентиль",
                    metric_statistics.p50 as "Медиана",
                    metric_statistics.p95 as "95 процентиль",
                    metric_statistics.std_dev as "Стандартное отклонение"
                FROM diag.metric_statistics
                JOIN diag.reference_groups ON reference_groups.id = metric_statistics.reference_group_id
                JOIN diag.metrics ON metrics.id = metric_statistics.metric_id
                LEFT JOIN diag.diseases ON diseases.id = reference_groups.disease_id
                ORDER BY metric_statistics.id ASC
            `);
            break;
        case 'reference-groups':
            result = await pool.query(`
                SELECT 
                    reference_groups.id as "id",
                    reference_groups.name as "Название",
                    reference_groups.age_min as "Минимальный возраст",
                    reference_groups.age_max as "Максимальный возраст",
                    reference_groups.sample_size as "Человек в группе"
                FROM diag.reference_groups
                ORDER BY reference_groups.id ASC
            `);
            break;
        case 'weights':
            result = await pool.query(`
                SELECT 
                    diseases.name as "Заболевание",
                    metrics.name as "Метрика",
                    dmw.weight as "Весовой коэффициент"
                FROM diag.disease_metric_weights dmw
                JOIN diag.diseases ON diseases.id = dmw.disease_id
                JOIN diag.metrics ON metrics.id = dmw.metric_id
                ORDER BY dmw.disease_id ASC, dmw.metric_id ASC;
            `);
            break;
        case 'test-results':
            query = `
            SELECT 
                examination_sessions.id as "id",
                patient.name as "Пациент",
                doctor.name as "Врач",
                examination_sessions.examination_date as "Дата проведения тестирования",
                examination_sessions.device_model as "Аппарат обследования",
                examination_sessions.software_version as "Версия ПО",
                CASE 
                    WHEN diseases.name IS NOT NULL THEN 
                        CONCAT(diseases.name, ' (', disease_severities.severity, ')')
                    ELSE 'Нет диагноза'
                END AS "Предварительный диагноз",
                status AS "Статус"
            FROM diag.examination_sessions
            JOIN diag.patients ON patients.id = examination_sessions.patient_id
            LEFT JOIN diag.disease_severities ON disease_severities.id = examination_sessions.suspected_severity 
            JOIN diag.users doctor ON doctor.id = examination_sessions.examined_by
            JOIN diag.users patient ON patient.id = patients.id
            LEFT JOIN diag.diseases ON diseases.id = examination_sessions.suspected_disease_id
            ORDER BY examination_sessions.id ASC

            `;

            if (ids.length > 0) {
                if (ids.length !== 1) throw new Error('Expected single ID for filtering test-results');
                query += ` WHERE patient.id = $1`;
                params = [Number(ids[0])];
            }
            result = await pool.query(query, params);
            break;
        case "metric_analysis_percentile_results":
            query = `
                SELECT
                    COALESCE(mar.percentile_rank::text, '-') as "percentile_rank",
                    m.name as "metric_name",
                    m.unit as "unit"
                FROM diag.examination_sessions es
                JOIN diag.session_metrics sm ON es.id = sm.session_id
                JOIN diag.metrics m ON sm.metric_id = m.id
                LEFT JOIN diag.metric_analysis_results mar ON mar.session_metric_id = sm.id
                `
            if (ids.length > 0) {
                if (ids.length !== 1) throw new Error('Expected single ID for filtering metric_analysis_results');
                query += ` WHERE es.id = $1`;
                params = [Number(ids[0])];
            }
            result = await pool.query(query, params);
            break;
        case 'metric_analysis_diagnostic_result':
            query = `
                SELECT
                    COALESCE(es.integral_idx::text, '-')as "idx",
                    diseases.name as "name",
                    ds.severity as "severity"
                FROM diag.examination_sessions es
                JOIN diag.diseases on es.suspected_disease_id = diseases.id
                JOIN diag.disease_severities ds on ds.id = es.suspected_severity
                `
            if (ids.length > 0) {
                if (ids.length !== 1) throw new Error('Expected single ID for filtering metric_analysis_diagnostic_result');
                query += ` WHERE es.id = $1`;
                params = [Number(ids[0])];
            }
            result = await pool.query(query, params);
            break;
            break;
        default:
            throw new Error(`Unknown table: ${tableName}`);
    }
    return result.rows;
}

app.listen(port, () => {
    console.log(`Server running on port: ${port}`);
});