const { GraphQLJSONObject } = require('graphql-type-json');
const { getChildren }  = require('../node_types/process.js');
const { getDgraphClient } = require('../dgraph_client.js');

const { 
    GraphQLObjectType, 
    GraphQLInt, 
    GraphQLString, 
    GraphQLList, 
    GraphQLBoolean,
    GraphQLUnionType, 
}  = require('graphql');

const BaseNode = {
    uid: {type: GraphQLInt},
    node_key: {type: GraphQLString}, 
    dgraph_type: {type: GraphQLList(GraphQLString)},
}

const LensNodeType = new GraphQLObjectType({
    name: "LensNode", 
    fields: () => ({
        ...BaseNode,
        lens_name: {type: GraphQLString}, 
        score: {type: GraphQLInt}, 
        scope: {type: GraphQLList(GraplEntityType)},
        lens_type: {type: GraphQLString}, 
    })
})
// function to build field resolver 
// predicates - property filters to apply to target node 

const getEdges = async (dg_client, rootUid, edgeName, predicates) => {
    // varAlloc - DGraph Variables
    const varAlloc = new VarAllocator();
    
    for (const [predicate_name, predicate_value, predicate_type] of predicates) {
        varAlloc.alloc(predicate_name, predicate_value, predicate_type);
    }
    const varTypes = varTypeList(varAlloc);
    const filter = generateFilter(varAlloc);
    const varListArray = Array.from(varAlloc.vars.keys()); // properties to return
    
    if (varListArray.indexOf('uid') === -1) {
        varListArray.push('uid');
    }
    
    if (varListArray.indexOf('node_key') === -1) {
        varListArray.push('node_key');
    }
    
    const varList = varListArray.join(", ");
    
    const query = `
        query q(${varTypes})
        {
            q(func: uid(${rootUid}))
            {
                ${edgeName}  
                @filter( ${filter}) 
                {
                    dgraph_type: dgraph.type
                    ${varList}
                }
            }
        }
    `;

    // filter - where clause, select

    const txn = dg_client.newTxn();

    try {
        const res = await txn.queryWithVars(query, reverseMap(varAlloc.vars));
        const root_node = res.getJson()['q'];

        if (!root_node) {
            return []
        }

        return root_node[edgeName] || [];
    } 
    finally {
        await txn.discard();
    }

}

const ProcessType = new GraphQLObjectType({
    name : 'Process',
    fields : () => ({
        ...BaseNode,
        created_timestamp: {type: GraphQLInt},
        image_name: {type: GraphQLString},
        process_name: {type: GraphQLString},
        process_id: {type: GraphQLInt},
        arguments: {type: GraphQLString}, 
        children: {
            type: GraphQLList(ProcessType),
            args: {
                pid: {type: GraphQLInt}, 
                process_name: {type: GraphQLString}
            }, 
            resolve: async (parent, args) => {
                try{
                    const children = await getEdges(
                        getDgraphClient(),
                        parent.uid,
                        'children',
                        [
                            ['pid', pid, 'int'],
                            ['process_name', process_name, 'string']
                        ]
                    )
                    // const children = await getChildren(getDgraphClient(), parent.uid, args); 
                    console.log("Process Found", children);
                    return children; 
                    
                } catch (e) {
                    console.log("e", e)
                    return 0; 
                }
            }
        },
        bin_file: {type: FileType},
        created_file: {type: FileType},
        deleted_files: {type:FileType},
        read_files: {type: GraphQLList(FileType)},
        wrote_files: {type: GraphQLList(FileType)},
        created_connections: {type: GraphQLList(ProcessOutboundConnections)},
        inbound_connections: {type: GraphQLList(ProcessInboundConnections)},
        risks: {type: GraphQLList(RiskType)},
    })
});

const RiskType = new GraphQLObjectType({
    name: 'Risk',
    fields: {
        ...BaseNode,
        analyzer_name: {type: GraphQLString}, 
        risk_score: {type: GraphQLInt},
    }
})

// We have to support every type in grapl_analyzerlib/schemas
// We also have to support dynamic types, which would map to plugins,
// probably using the GraphQLJsonType

// TODO: File is missing all of its properties
const FileType = new GraphQLObjectType({
    name : 'File',
    fields : {
        ...BaseNode,
        file_name: {type: GraphQLString},
        file_type: {type: GraphQLString},
        file_extension: {type: GraphQLString},
        file_mime_type: {type: GraphQLString},
        file_size: {type: GraphQLInt},
        file_version: {type: GraphQLString}, 
        file_description: {type: GraphQLString},
        file_product: {type: GraphQLString},
        file_company: {type: GraphQLString}, 
        file_directory: {type: GraphQLString},
        file_inode: {type: GraphQLInt},
        file_hard_links: {type: GraphQLString}, 
        signed: {type: GraphQLBoolean},
        signed_status: {type: GraphQLString}, 
        md5_hash: {type: GraphQLString},
        sha1_hash: {type: GraphQLString},
        sha256_hash: {type: GraphQLString},
        risks: {type: GraphQLList(RiskType)},
        file_path: {type: GraphQLString},
    }
});

const IpConnections = new GraphQLObjectType({
    name: 'IpConnections',
    fields: () => ({
        ...BaseNode,
        risks: {type: GraphQLList(RiskType)},
        src_ip_addr: {type: GraphQLString},
        src_port: {type: GraphQLString},
        dst_ip_addr: {type: GraphQLString},
        dst_port: {type: GraphQLString},
        created_timestamp: {type: GraphQLInt},
        terminated_timestamp: {type: GraphQLInt},
        last_seen_timestamp: {type: GraphQLInt},
        inbound_ip_connection_to: {type: IpAddressType},
    })
})


const NetworkConnection = new GraphQLObjectType({
    name: 'NetworkConnection',
    fields: () => ({
        src_ip_address: {type: GraphQLString}, 
        src_port: {type: GraphQLString}, 
        dst_ip_address: {type: GraphQLString}, 
        dst_port: {type: GraphQLString}, 
        created_timestamp: {type: GraphQLInt}, 
        terminated_timestamp: {type: GraphQLInt},
        last_seen_timestamp: {type: GraphQLInt},
        inbound_network_connection_to: {type: GraphQLList(IpPort)},
    })
}) 

const IpPort = new GraphQLObjectType({
    name: 'IpPort',
    fields: {
        ...BaseNode,
        ip_address: {type: GraphQLString},
        protocol: {type: GraphQLString},
        port: {type: GraphQLInt}, 
        first_seen_timestamp: {type: GraphQLInt}, 
        last_seen_timestamp: {type: GraphQLInt}, 
        network_connections: {type: GraphQLList(NetworkConnection)},
    }
})

const IpAddressType = new GraphQLObjectType({
    name : 'IpAddress',
    fields : {
        ...BaseNode,
        risks: {type: GraphQLList(RiskType)},
        ip_address: {type: GraphQLString}
    }
});

const AssetType = new GraphQLObjectType({
    name : 'Asset',
    fields : {
        ...BaseNode,
        risks: {type: GraphQLList(RiskType)},
        hostname: {type: GraphQLString},
        asset_ip: {type: GraphQLList(IpAddressType)},
        asset_processes: {type: GraphQLList(ProcessType)}, 
        files_on_asset: {type: GraphQLList(FileType)},
    }
});

const ProcessInboundConnections = new GraphQLObjectType ({
    name: 'ProcessInboundConnections',
    fields: {
        ...BaseNode,
        ip_address: {type: GraphQLString},
        protocol: {type: GraphQLString}, 
        created_timestamp: {type: GraphQLInt}, 
        terminated_timestamp: {type: GraphQLInt},
        last_seen_timestamp: {type: GraphQLInt},
        port: {type: GraphQLInt},
        bound_port: {type: GraphQLList(IpPort)},
        bound_ip: {type: GraphQLList(IpAddressType)},
    }
})

const ProcessOutboundConnections = new GraphQLObjectType ({
    name: 'ProcessOutboundConnections',
    fields: {
        ...BaseNode,
        ip_address: {type: GraphQLString},
        protocol: {type: GraphQLString},
        created_timestamp: {type: GraphQLInt}, 
        terminated_timestamp: {type: GraphQLInt},
        last_seen_timestamp: {type: GraphQLInt},
        port: {type: GraphQLInt},
        connected_over: {type: GraphQLList(IpPort)},
        connected_to: {type: GraphQLList(IpPort)},
    }
})

const PluginType = new GraphQLObjectType({
    name: 'PluginType',
    fields: {
        predicates: { type: GraphQLJSONObject },
    }
})

const builtins = new Set([
    'Process',
    'File',
    'IpAddress',
    'Asset',
    'Risk',
    'IpConnections',
    'ProcessInboundConnections',
    'ProcessOutboundConnections',
])

const resolveType = (data) => {
    if (data.dgraph_type[0] === 'Process') {
        return 'Process';
    }

    if (data.dgraph_type[0] === 'File') {
        return 'File';
    }

    if (data.dgraph_type[0] === 'IpAddress') {
        return 'IpAddress';
    }
    
    if (data.dgraph_type[0] === 'Asset') {
        return 'Asset';
    }

    if (data.dgraph_type[0] === 'Risk'){
        return 'Risk';
    }

    if (data.dgraph_type[0] === 'IpConnections'){
        return 'IpConnections';
    }

    if (data.dgraph_type[0] === 'ProcessInboundConnections'){
        return 'ProcessInboundConnections';
    }

    if (data.dgraph_type[0] === 'ProcessOutboundConnections'){
        return 'ProcessOutboundConnections';
    }
    
    return 'PluginType'
};

// ## TODO - ADD ALL NON-DYNAMIC TYPES  
    
const GraplEntityType = new GraphQLUnionType({
    name: 'GraplEntityType',
    types: [ PluginType, FileType, ProcessType, AssetType ],
    resolveType: resolveType
});

module.exports = { 
    BaseNode, 
    LensNodeType, 
    RiskType, 
    FileType, 
    IpConnections, 
    ProcessType, 
    NetworkConnection, 
    IpPort, 
    IpAddressType, 
    AssetType, 
    ProcessOutboundConnections, 
    ProcessInboundConnections, 
    builtins, 
    PluginType, 
    GraplEntityType
};