const fs = require('fs');
const SmartsheetClient = require('smartsheet');
const mongoose = require('mongoose'); 
const fieldWireBaseUrl = process.env.FIELDWIRE_URL
const fieldWireToken = process.env.FIELDWIRE_TOKEN

const accessToken = process.env.SMARTSHEET_ACCESS_KEY;
const smartsheet = SmartsheetClient.createClient({ accessToken });
const sheetId = process.env.SMARTSHEET_SHEETID;
const MOGODB_URI=process.env.MOGODB_URI;
const axios = require('axios');








const findMismatchedData = (smartsheetData, mongodbData, id) => {
    const smartsheetMap = new Map(smartsheetData.map(item => [item[id], item]));
    const mongodbMap = new Map(mongodbData.map(item => [item[id], item]));


    const mismatchedData = [];
 
    // Find mismatched items based on the identifier
    for (const [id, smartsheetItem] of smartsheetMap) {
        const mongodbItem = mongodbMap.get(id);
    
        // if (mongodbItem && !deepCompare(smartsheetItem.cellData, mongodbItem.cellData)) {
        //     mismatchedData.push({
        //         smartsheet: smartsheetItem.cellData,
        //         mongodb: mongodbItem.cellData
        //     });
        // }

        if (!mongodbItem || !deepCompare(smartsheetItem, mongodbItem)) {
            mismatchedData.push({ smartsheet: smartsheetItem,mongodb: mongodbItem});
        }
    }
    
    const jsonsData = JSON.stringify( mismatchedData , null, 2);

    fs.writeFileSync('mismatchedData.json', jsonsData);

    return mismatchedData;
};






function deepCompare(obj1, obj2, path = '') {
    // Check if both values are null or undefined
    if (obj1 === null || obj1 === undefined) {
        return obj2 === null || obj2 === undefined;
    }

    // Special handling for "_id" property
    if (obj1?._id?.$oid && obj2 instanceof ObjectId) {
        return obj1._id.$oid === obj2.toString();
    }

    // Check if both values are of the same type
    if (typeof obj1 !== typeof obj2) {
        // console.log(`Type mismatch at path ${path}: ${typeof obj1} !== ${typeof obj2}`);
        return false;
    }

    // If both objects are arrays, compare their elements
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
        if (obj1.length !== obj2.length) {
            // console.log(`Array length mismatch at path ${path}: ${obj1.length} !== ${obj2.length}`);
            
            return false;
        }

        for (let i = 0; i < obj1.length; i++) {
            if (!deepCompare(obj1[i], obj2[i], `${path}[${i}]`)) {
                return false;
            }
        }

        return true;
    }

    

    if (typeof obj1 === 'object' && obj1 !== null && typeof obj2 === 'object' && obj2 !== null) {
        const keys1 = Object.keys(obj1).filter(key => key !== '_id'); // Exclude '_id'
        const keys2 = Object.keys(obj2).filter(key => key !== '_id');

        if (keys1.length !== keys2.length) {
            
            // Log the keys themselves
            // console.log(`Keys at path ${path} in obj1: ${keys1}`);
            // console.log(`Keys at path ${path} in obj2: ${keys2}`);
            
            return false;
        }

        for (const key of keys1) {
            if (!keys2.includes(key) || !deepCompare(obj1[key], obj2[key], `${path}.${key}`)) {
                return false;
            }
        }

        return true;
    }

    // if (path.endsWith('.Task Name')) {

    //     return obj1.trim().toLowerCase() === obj2.trim().toLowerCase();
    // }
    
    
    // Otherwise, compare values
    if (obj1 !== obj2) {
        console.log(`Value mismatch at path ${path}: ${obj1} !== ${obj2}`);
        return false;
    }

    return true;
}


const clearMismatchedDataFile = () => {
    fs.unlinkSync('mismatchedData.json');
    console.log('Mismatched data file cleared.');
};



const SmartsheetData = async () => {
    try {
        await mongoose.connect(MOGODB_URI);


        const collection = mongoose.connection.collection('FieldWire');

        // Check if there is any data in the MongoDB collection
        const hasDataInDB = await collection.countDocuments() > 0;

        if (hasDataInDB) {
            clearMismatchedDataFile();

            console.log('Data already exists in MongoDB. Checking for mismatches...');

            // Retrieve data from MongoDB
            const mongodbData = await collection.find({}).toArray();
            // console.log(mongodbData);

            // Retrieve data from Smartsheet API
            const result = await smartsheet.sheets.getSheet({ id: sheetId });
            // console.log(result);

    
            const rowsData = result.rows.map(row => {
                const cellData = {};

                result.columns.forEach(column => {
                    const cell = row.cells.find(cell => cell.columnId === column.id);
                    cellData[column.title] = cell?.value ? cell.value : null;
                });

                return cellData;
            });
                           
          

            const jsonData = JSON.stringify(rowsData, null, 2);
            fs.writeFileSync('rowsData.json', jsonData);
            // console.log('data saved to rowsData.jsonfile')

            // Find mismatched items
            // const id ='Task ID'
            const mismatchedData = findMismatchedData(rowsData, mongodbData, 'Task ID');

            if (mismatchedData.length === 0) {
                console.log('Smartsheet and MongoDB data match!');
            } else {
                console.log('Smartsheet and MongoDB data do not match.');
                
            }


            for (const mismatchedItem of mismatchedData) {
                const smartsheetItem = mismatchedItem.smartsheet;
                const mongodbItem = mismatchedItem.mongodb;
                
                const filter = { 'Task ID': smartsheetItem['Task ID'] };
                // console.log(filter)
            
                // Compare objects property by property without considering the "_id" field
                const changedProperties = Object.keys(smartsheetItem).filter(key => {
                    return smartsheetItem[key] !== mongodbItem[key];
                });
            
                if (changedProperties.length > 0) {
                    
                       // Data has changed, update it
                        await collection.updateOne(filter, { $set: smartsheetItem });
                       // Log only the key-value pairs of changed properties
                        changedProperties.forEach(key => {
                            console.log(`  ${key}: ${smartsheetItem[key]}`);
                        });    
                } 

            }


            // await updateFieldWireApi(mismatchedData);
            
            console.log('Mismatched data updates completed');
            // clearMismatchedDataFile();
            

        } else {
           

            await mongoose.connect(MOGODB_URI);


            const collection = mongoose.connection.collection('FieldWire');

             
            const result = await smartsheet.sheets.getSheet({ id: sheetId });

            
            const rowsData = result.rows.map(row => {
                const cellData = {};

                result.columns.forEach(column => {
                    const cell = row.cells.find(cell => cell.columnId === column.id);
                    cellData[column.title] = cell?.value ? cell.value : null;
                });

                return cellData;
            });
                 
             

            await collection.insertMany(rowsData);

            const jsonData = JSON.stringify(rowsData, null, 2);
            fs.writeFileSync('rowsData.json', jsonData);
            console.log('Rows data has been saved to MongoDB');
        }
        
    } catch (error) {
        console.error(error);
        console.log('Something went wrong');
    } finally {
        await mongoose.connection.close();
    }
};


const updateFieldWireApi = async (mismatchedData) => {
    try {
      const fieldWireApiUrl = fieldWireBaseUrl; 
      console.log("fieldWireApiUrl",fieldWireApiUrl);
      const targetProjectId = '2f3e3293-5bc5-42e2-90c3-31168134e5e7';
      
      for (const mismatchedItem of mismatchedData) {
        if (mismatchedItem && mismatchedItem.smartsheet) {
          const projectId = mismatchedItem.smartsheet['Project ID'];
          const taskId = mismatchedItem.smartsheet['Task ID'];
          const name=mismatchedItem.smartsheet['Category']
          const Status=mismatchedItem.smartsheet['Status']
          const floorplanName=mismatchedItem.smartsheet['Description']
        console.log(floorplanName);
            
          if (projectId === targetProjectId) {
            
            if ('Task Name' in mismatchedItem.smartsheet) {

              const url = `${fieldWireApiUrl}/projects/${projectId}/tasks/${taskId}`;
              console.log(url);
              const data = {
                name: mismatchedItem.smartsheet['Task Name'],
              };
  
              const headers = {
                'Authorization': `Token api=${fieldWireToken}`,
                'Content-Type': 'application/json',
              };

              
  
              const response = await axios.patch(url, data, { headers });
            //   console.log("task name updated")
            //   console.log(response?.data);
           
  
           
            } 


            if ('Status' in mismatchedItem.smartsheet) {
                // Fetching statuses
                const options = {
                    method: 'GET',
                    url: `${fieldWireApiUrl}/projects/${projectId}/statuses`,
                    headers: {
                        'Authorization': `Token api=${fieldWireToken}`,
                        'Content-Type': 'application/json',
                    }
                };
            
                try {
                    const response = await axios.request(options);
                    // console.log("Statuses:", response.data);
            
                    const statuses = response.data;
                    // console.log("Status Response Data:", statuses);
            
                    // Finding the matching status
                    
                    const status = statuses.find(
                        status => status.name === Status && status.project_id === projectId
                    );
                    // console.log("status data",status)
            
                    if (status) {
                        // Updating task with the found status
                        const url = `${fieldWireApiUrl}/projects/${projectId}/tasks/${taskId}`;
                        const data = {
                            status_id: status.id
                        };
                        const headers = {
                            'Authorization': `Token api=${fieldWireToken}`,
                            'Content-Type': 'application/json',
                        };
            
                        // Patching the task with the new status
                        const patchResponse = await axios.patch(url, data, { headers });
                        // console.log(patchResponse?.data);
                        console.log("Status updated");
                    }
                } catch (error) {
                    console.error("Error fetching or updating status:", error.message);
                    console.error("Response data:", error.response?.data);
                }
            }
            
            if ('Project Name' in mismatchedItem.smartsheet) {

                const url = `${fieldWireApiUrl}/projects/${projectId}`;
                

                const data = {
                    name: mismatchedItem.smartsheet['Project Name']
                };
    
                const headers = {
                  'Authorization': `Token api=${fieldWireToken}`,
                  'Content-Type': 'application/json',
                };

                
    
                const response = await axios.patch(url, data, { headers });
                // console.log(response?.data);
    
            }
             
            // if ('Description' in mismatchedItem.smartsheet) {

            //     const options = {
            //         method: 'GET',
            //         url: '`${fieldWireApiUrl}/projects/project_id/floorplans',
            //         headers: {accept: 'application/json'}
            //     };
                  
            //       axios
            //         .request(options)
            //         .then(function (response) {
            //           console.log(response.data);
            //         })
            //         .catch(function (error) {
            //           console.error(error);
            //         });
                  
               

            //     // const url = `${fieldWireApiUrl}/projects/${projectId}/floorplans`;
            //     // // const url = `${fieldWireApiUrl}/floorplans`;
    
            //     // const headers = {
            //     //   'Authorization': `Token api=${fieldWireToken}`,
            //     //   'Content-Type': 'application/json',
            //     // };
    
            //     // const response = await axios.get(url, { headers });
            //     const FloorPlan = response.data

            //     console.log("floorplan",FloorPlan);

            //     const floorplan= FloorPlan.find(
            //         floorplan => floorplan.name === floorplanName && floorplan.project_Id === projectId
            //     )


            //     if(floorplan){
            //         const url = `${fieldWireApiUrl}/projects/${projectId}/tasks/${taskId}`;

                    
    
            //         const data = {

            //             floorplan_id:floorplan.id

            //         };
        
            //         const headers = {
            //           'Authorization': `Token api=${fieldWireToken}`,
            //           'Content-Type': 'application/json',
            //         };
                    
                    
            //         const response = await axios.patch(url, data, { headers });
            //         // if (response.status === 404) {
            //         //     console.error(`Status code 404 received. Requested resource not found.`);
            //         // } else {
            //         //     console.log(response.data);
            //         // }
    
            //         console.log(response?.data);
            //         console.log("description updated")
            //     }
                 
    
            // }

            if ('Description' in mismatchedItem.smartsheet) {
                

                    const options = {
                        method: 'GET',
                        url: `${fieldWireApiUrl}/projects/${projectId}/floorplans`,
                        headers: {
                          'Authorization': `Token api=${fieldWireToken}`,
                          'Content-Type': 'application/json',
                        },
                      };

                    //   console.log("options",options);
                      
                      try {
                        const response = await axios.request(options);
                        // console.log("response.data",response.data);

                        const FloorPlan = response.data;
                        console.log("Floorplan",FloorPlan);

                        const floorplan = FloorPlan.find(
                            floorplan => floorplan.name === floorplanName && floorplan.project_Id === projectId
                          );
                      
                          if (floorplan) {
                            const url = `${fieldWireApiUrl}/projects/${projectId}/tasks/${taskId}`;
                      
                            const data = {
                              floorplan_id: floorplan.id,
                            };
                      
                            const headers = {
                                'Authorization': `Token api=${fieldWireToken}`,
                                'Content-Type': 'application/json',
                            };
                              
                      
                            const patchResponse = await axios.patch(url, data, { headers });
                            console.log(patchResponse?.data);
                            console.log("description updated");
                          }

                      
                        // Rest of your code...
                      } catch (error) {
                        console.error("Error:", error.message);
                        console.error("Response data:", error.response?.data);
                      }
                      
                //   const options = {
                //     method: 'GET',
                //     url: `${fieldWireApiUrl}/projects/${projectId}/floorplans`,
                //     headers :{
                //         'Authorization': `Bearer ${fieldWireToken}`,
                //         'Content-Type': 'application/json',
                //     }
                      
                //   };
              
                //   const response = await axios.request(options);
                //   //   console.log(response.data);
              
                //   const FloorPlan = response.data;
                //   console.log("floorplan", FloorPlan);
              
            }
              

            // if ('Category' in mismatchedItem.smartsheet) {
                
            //     const urlTeams = `${fieldWireApiUrl}/projects/${projectId}/teams`;
            //     const theaders = {
            //         'Authorization': `Token api=${fieldWireToken}`,
            //         'Content-Type': 'application/json',
            //     };
            
            //     try {
            //         const responseTeams = await axios.get(urlTeams, { headers: theaders });
            //         console.log("Teams:", responseTeams.data);
            
            //         const teams = responseTeams.data;
            
                   
            //         const team = teams.find(
            //             team => team.name === name && team.project_Id === projectId
            //         );
            
            //         if (team) {
                        
            //             const url = `${fieldWireApiUrl}/projects/${projectId}/tasks/${taskId}`;
            //             const data = {
            //                 team_id: team.id
            //             };
            
            //             const headers = {
            //                 'Authorization': `Token api=${fieldWireToken}`,
            //                 'Content-Type': 'application/json',
            //             };
            
                        
            //             const response = await axios.patch(url, data, { headers });
            //             console.log(response?.data);
            //             console.log("Category updated");
            //         } else {
            //             console.log("Team not found for the specified criteria.");
            //         }
            //     } catch (error) {
            //         console.error("Error fetching or updating category:", error.message);
            //         console.error("Response data:", error.response?.data);
            //     }
            // }
            
            
            // if ('Assignee' in mismatchedItem.smartsheet) {

            //     const url = `${fieldWireApiUrl}/projects/${projectId}/users/${teamid}`;
            //     // console.log(url);

            //     const data = {
            //         name: mismatchedItem.smartsheet['Assignee']
            //     };
    
            //     const headers = {
            //       'Authorization': `Token api=${fieldWireToken}`,
            //       'Content-Type': 'application/json',
            //     };

    
            //     const response = await axios.patch(url, data, { headers });
            //     // console.log(response?.data);
    
            // }
            


            if ('Start Date' in mismatchedItem.smartsheet) {

                const url = `${fieldWireApiUrl}/projects/${projectId}/tasks/${taskId}`;
                // console.log(url);

                const data = {
                    start_at: mismatchedItem.smartsheet['Start Date']
                };
    
                const headers = {
                  'Authorization': `Token api=${fieldWireToken}`,
                  'Content-Type': 'application/json',
                };

                // console.log("fieldwireToken",fieldWireToken);
                // console.log('Updating task with the following data:', data);
    
                const response = await axios.patch(url, data, { headers });
                // console.log(response?.data);
    
            }
    

            if ('End Date' in mismatchedItem.smartsheet) {

                const url = `${fieldWireApiUrl}/projects/${projectId}/tasks/${taskId}`;
                // console.log(url);

                const data = {
                    end_at: mismatchedItem.smartsheet['End Date']
                };
    
                const headers = {
                  'Authorization': `Token api=${fieldWireToken}`,
                  'Content-Type': 'application/json',
                };
    
                const response = await axios.patch(url, data, { headers });
                // console.log(response?.data);
                console.log('')
    
            }


          }


        } else {
          console.error('Invalid mismatchedItem:', mismatchedItem);
        }
      }
  
      
    } catch (error) {
      console.error('Error updating FieldWire API:', error);
    }
};


// const updateFieldWireApi = async (mismatchedData) => {
//   try {
//     const fieldWireApiUrl = fieldWireBaseUrl; 
//     console.log("fieldWireBaseUrl",fieldWireBaseUrl);
//     const targetProjectId = '2f3e3293-5bc5-42e2-90c3-31168134e5e7';
//      console.log(mismatchedData);

//     for (let i = 0; i < mismatchedData.length; i++)  {
//         const mismatchedItem = mismatchedData[i].smartsheet;
//         console.log(mismatchedItem);
//         const projectId = mismatchedItem && mismatchedItem['Project ID'];
//         const taskId = mismatchedItem && mismatchedItem['Task ID'];

//         console.log(projectId);
//         console.log(taskId);

//     //   const url = `${fieldWireApiUrl}/projects/${projectId}/tasks/${taskId}`;
//     //   const data = {
//     //     name: mismatchedItem.TaskName,
//     //     sequence_number: mismatchedItem.Number
//     //   };

//     //   const headers = {
//     //     'Authorization': 'fieldWireToken', 
//     //     'Content-Type': 'application/json',
        
//     //   };

    
//     if ('Task Name' in mismatchedItem.smartsheet || 'Task Number' in mismatchedItem.smartsheet) {
//         const url = `${fieldWireApiUrl}/projects/${projectId}/tasks/${taskId}`;
//         const data = {
//           name: mismatchedItem.smartsheet['Task Name'],
//           sequence_number: mismatchedItem.smartsheet['Task Number'],
//           // Add other fields as needed
//         };
//         console.log("data",data);

//         const headers = {
//           'Authorization': `Token api=${fieldWireToken}`, 
//           'Content-Type': 'application/json',
          
//         };

//         console.log("fieldWireToken",fieldWireToken)

//         const response = await axios.patch(url, data, { headers });

//         if (response.status === 200) {
//           console.log(`Successfully updated FieldWire API for Task ID: ${taskId} in Project ID: ${projectId}`);
//         } else {
//           console.error(`Failed to update FieldWire API for Task ID: ${taskId} in Project ID: ${projectId}`);
//         }
//     } else {

//         console.log(`No update needed for Task ID: ${taskId} in Project ID: ${projectId}`);      
//     }


// }
      
//     console.log('FieldWire API updates completed');
//   } catch (error) {
//     console.error('Error updating FieldWire API:', error);
//   }
// };


  
  

module.exports = SmartsheetData;



