const { default: axios } = require("axios");
const SmartsheetClient = require('smartsheet');


const fieldWireBaseUrl = process.env.FIELDWIRE_URL
const fieldWireToken = process.env.FIELDWIRE_TOKEN

const accessToken = process.env.SMARTSHEET_ACCESS_KEY;
const smartsheet = SmartsheetClient.createClient({ accessToken });
const sheetId = process.env.SMARTSHEET_SHEETID;


const apiCall = async (apiEndpoint, headers, resultArray = []) => {

    try {

        //console.log("apiEndpoint", apiEndpoint);

        const config = {
            method: "get",
            url: apiEndpoint,
            headers: headers
        }

        const getDataRes = await axios(config)

        const getData = resultArray?.length >= 1000 ? [...getDataRes.data].slice(1) : [...getDataRes.data]

        const updatedData = [...resultArray, ...getData]

        if (getDataRes.data.length === 1000) {
            const newHeaders = {
                ...headers,
                "X-Has-More": true,
                "X-Count": resultArray.length + getData.length,
            }

            //console.log("newHeaders", apiEndpoint, headers, newHeaders, resultArray.length);

            const newAPIEndpoint = `${apiEndpoint}?last_synced_at=${getData[getData.length - 1].updated_at}`

            return await apiCall(newAPIEndpoint, newHeaders, updatedData)
        } else {
            console.log("newHeaders", apiEndpoint, headers, resultArray.length);
            return updatedData
        }

    } catch (err) {
        console.log(err);
        return err
    }
}


const nestedApiCall = async (data, type = null) => {

    if (data?.length > 0 && type) {

        const projectNestedData = data
            .filter(project => project.id)
            .map(async project => {

                const response = await apiCall(`${fieldWireBaseUrl}projects/${project.id}/${type}`,
                    {
                        "Authorization": `Token api=${fieldWireToken}`,
                        "fieldwire-per-page": 1000,
                        "Fieldwire-Filter": "active",
                        "X-Count": 0
                    },)
                return response

            });

        const allResults = await Promise.all(projectNestedData);

        const finalData = allResults.reduce((acc, result) => acc.concat(result), [])

        return finalData;
    }

}


const getFieldWireData = async () => {

    console.log("updating................................!");

    try {

        const result = await smartsheet.sheets.getSheet({ id: sheetId })

        console.log("result**** rows", result);

        if (result) {
            const rowIDs = result.rows?.map(row => row.id)

            const chunkSize = 300;

            const idChunks = [];
            for (let i = 0; i < rowIDs.length; i += chunkSize) {
                idChunks.push(rowIDs.slice(i, i + chunkSize));
            }

            for (const listID of idChunks) {

                const options = {
                    sheetId: sheetId,
                    rowId: listID
                };


                await smartsheet.sheets.deleteRow(options)

            }



            const FWProjects = await apiCall(
                `${fieldWireBaseUrl}account/projects`,
                {
                    "Authorization": `Token api=${fieldWireToken}`,
                    "fieldwire-per-page": 1000,
                },
            )

            if (!FWProjects?.length > 0) {
                return res.send("Project not found")
            }

            const FWUsers = await apiCall(
                `${fieldWireBaseUrl}account/users`,
                {
                    "Authorization": `Token api=${fieldWireToken}`,
                    "fieldwire-per-page": 1000,
                },
            )

            const FWTasks = await nestedApiCall(FWProjects, "tasks")

            const FWTaskTypes = await nestedApiCall(FWProjects, "task_types")

            const FWFloorPlans = await nestedApiCall(FWProjects, "floorplans")

            const FWTeams = await nestedApiCall(FWProjects, "teams")

            const FWStatuses = await nestedApiCall(FWProjects, "statuses")


            if (FWProjects && FWUsers && FWTasks && FWFloorPlans && FWStatuses && FWTaskTypes && FWTeams) {
                let finalData = []

                FWProjects.forEach(project => {
                    const filteredTasks = FWTasks.filter(task => task.project_id === project.id)

                    if (filteredTasks?.length > 0) {

                        filteredTasks.forEach(task => {
                            const getFloorPlan = FWFloorPlans.find(floorPlan => floorPlan.id === task.floorplan_id)
                            const getStatuse = FWStatuses.find(status => status.id === task.status_id)
                            const getTaskType = FWTaskTypes.find(type => type.id === task.task_type_id)
                            const getTeam = FWTeams.find(team => team.id === task.team_id)
                            const getUser = FWUsers.find(user => user.user?.id === task?.user_ids[0])

                            const obj = {}
                            obj.ProjectName = project.name
                            obj.ProjectStatus = project.archived_at
                            obj.taskName = task.name
                            obj.taskID = task.sequence_number
                            obj.start_at = task.start_at
                            obj.end_at = task.end_at
                            if (getFloorPlan) {
                                obj.floorPlanName = getFloorPlan.name
                            }
                            if (getStatuse) {
                                obj.statusName = getStatuse.name
                            }
                            if (getTaskType) {
                                obj.taskTypeName = getTaskType.name
                            }
                            if (getTeam) {
                                obj.teamName = getTeam.name
                            }
                            if (getUser) {
                                obj.userName = getUser?.user?.first_name + " " + getUser?.user?.last_name
                            }

                            finalData.push(obj)
                        });

                    }
                });

                const columns = await smartsheet.sheets.getColumns({ sheetId });

                const addRows = []

                if (finalData?.length > 0 && columns.data) {
                    for (const rowData of finalData) {
                        const rowObj = {
                            "Project Name": rowData.ProjectName,
                            "Project Status": rowData.ProjectStatus,
                            "Task ID": rowData.taskID,
                            "Task Name": rowData.taskName,
                            "Description": rowData.floorPlanName,
                            "Status": rowData.statusName,
                            "Category": rowData.teamName,
                            "Assignee": rowData.userName,
                            "Start Date": rowData.start_at,
                            "End Date": rowData.end_at,
                        }

                        const options = {
                            "toTop": true,
                            cells: Object.keys(rowObj).map(columnName => ({
                                columnId: columns.data.find(i => i.title == columnName).id,
                                value: rowObj[columnName] || null,
                            })),
                        }

                        addRows.push(options)
                    }
                }


                const result = await smartsheet.sheets.addRow({
                    sheetId: sheetId,
                    body: addRows
                })

                console.log("result", result);
            }

            console.log("data added successfully")
        } else {
            console.log("something went wrong not getting rows");
        }

    } catch (error) {
        console.log(error);
        console.log("something went wrong")
    }

}

module.exports = getFieldWireData