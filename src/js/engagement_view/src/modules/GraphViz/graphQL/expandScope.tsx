import {BaseNode, LensScopeResponse} from '../../GraphViz/CustomTypes'
import {mapGraph} from "../graph/graph_traverse";
import {getGraphQlEdge} from '../engagement_edge/getApiURLs';

const graphql_edge = getGraphQlEdge();

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

const unpackPluginNodes = (nodes: BaseNode[]) => {
    for (const node of nodes) {
        if (!(node as any).predicates) {
            continue
        }
        mapGraph(node, (node, edge_name, neighbor) => {
            if ((node as any).predicates) {
                if(!builtins.has((node as any).predicates.dgraph_type[0])) {
                    // Using 'any' because the PluginType is temporary, and not valid outside of the initial response
                    const pluginNode = {...(node as any).predicates};
                    delete (node as any).predicates
                    Object.keys(pluginNode).forEach(function(key) { (node as any)[key] = pluginNode[key]; });
                }
            }

            if ((neighbor as any).predicates) {
                if(!builtins.has((neighbor as any).predicates.dgraph_type[0])) {
                    // Using 'any' because the PluginType is temporary, and not valid outside of the initial response
                    const pluginNode = {...(neighbor as any).predicates};
                    delete (neighbor as any).predicates
                    Object.keys(pluginNode).forEach(function(key) { (neighbor as any)[key] = pluginNode[key]; });
                }
            }
        })

    }
}

// Filter lens scope
// Pass in lensWithScope
// Iterate over graph, (use map graph)
// If a node in the schope or anywhere in the graph doesn't have an edge (in_scope) to current lens, remove that node. uid,
// Map Graph takes a graph and a callback, in the callback, you'll get a node, if this node doesn't have an edge, delete it

export const retrieveGraph = async (lens: string): Promise<(LensScopeResponse & BaseNode)> => {
    const query = expandScope(lens);

    const res = await fetch(`${graphql_edge}graphql`,
        {
            method: 'post',
            body: JSON.stringify({ query }),
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
        })
        .then(res => res.json())
        .then(res => {
            return res
        })
        .then((res) => res.data)
        .then((res) => res.lens_scope);

    const lensWithScope = await res;
    
    unpackPluginNodes(lensWithScope.scope);
    
    return lensWithScope;
};

export const expandScope = (lensName: string) => {
    
    const query = `
        {
            lens_scope(lens_name: "${lensName}") {
                    ... on LensNode {
                        uid,
                        node_key,
                        lens_name,
                        lens_type,
                        dgraph_type,
                        scope {
                            ... on Process {
                                uid,
                                node_key, 
                                dgraph_type,
                                process_name, 
                                process_id,
                                children(filter: in_scope{lens_name: ${lensName}}) {
                                    uid, 
                                    node_key, 
                                    dgraph_type,
                                    process_name, 
                                    process_id,
                                    risks {  
                                        uid,
                                        dgraph_type,
                                        node_key, 
                                        analyzer_name, 
                                        risk_score
                                    }
                                },
                                risks {  
                                    uid,
                                    dgraph_type,
                                    node_key, 
                                    analyzer_name, 
                                    risk_score
                                },
                            }
                        
                            ... on Asset {
                                uid, 
                                node_key, 
                                dgraph_type,
                                hostname,
                                asset_ip(filter: in_scope{lens_name: ${lensName}}){
                                    ip_address
                                }, 
                                asset_processes(filter: in_scope{lens_name: ${lensName}}){
                                    uid, 
                                    node_key, 
                                    dgraph_type,
                                    process_name, 
                                    process_id,
                                },
                                files_on_asset(filter: in_scope{lens_name: ${lensName}}){
                                    uid, 
                                    node_key, 
                                    dgraph_type,
                                    file_path
                                }, 
                                risks {  
                                    uid,
                                    dgraph_type,
                                    node_key, 
                                    analyzer_name, 
                                    risk_score
                                },
                            }
            
                            ... on File {
                                uid,
                                node_key, 
                                dgraph_type,
                                risks {  
                                    uid,
                                    dgraph_type,
                                    node_key, 
                                    analyzer_name, 
                                    risk_score
                                },
                            }
                            ... on PluginType {
                                predicates,
                            }
                    }
                }
            }
        }
    `;

    return query;
}

